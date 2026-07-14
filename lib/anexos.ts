// Leitura de anexos de Substituição Tributária (ou outras listas por NCM)
// enviados pela empresa (Excel ou CSV). Tolerante a variações de
// cabeçalho; quando a detecção automática falha, a interface pede para o
// usuário mapear manualmente as colunas (MapeamentoColunasAnexo.tsx).

import * as XLSX from "xlsx";
import type { AnexoColunas, AnexoEmpresa, LinhaAnexo } from "./empresas";
import { buscarRegraPalavraChaveAnexo, extrairPalavrasChaveDescricao, nomeContemPalavraChave } from "./tables";

const REGEX_DIACRITICOS = /[\u0300-\u036f]/g;

function normalizarChaveCabecalho(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES_NCM = ["ncm", "codigoncm", "ncodigoncm", "ncmsh"];
const ALIASES_DESCRICAO = ["descricao", "produto", "descricaodoproduto", "mercadoria", "descricaomercadoria"];
const ALIASES_MVA = ["mva", "mvaoriginal", "mvapercentual", "mvaperc", "mva"];

type LinhaBruta = unknown[];

/** Lê a primeira aba de um arquivo .xls/.xlsx/.csv como matriz de linhas cruas. */
export function lerLinhasAnexo(dados: ArrayBuffer): LinhaBruta[] {
  const workbook = XLSX.read(dados, { type: "array" });
  const primeiraAba = workbook.SheetNames[0];
  const sheet = workbook.Sheets[primeiraAba];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<LinhaBruta>(sheet, { header: 1, defval: "", raw: true });
}

/** Tenta identificar as colunas de NCM/Descrição/MVA pelo cabeçalho (primeira linha). Retorna null se não achar ao menos o NCM. */
export function detectarColunasAnexo(linhas: LinhaBruta[]): AnexoColunas | null {
  if (linhas.length === 0) return null;
  const cabecalho = linhas[0];

  let ncm: number | undefined;
  let descricao: number | undefined;
  let mva: number | undefined;

  cabecalho.forEach((celula, indice) => {
    const chave = normalizarChaveCabecalho(celula);
    if (ncm === undefined && ALIASES_NCM.includes(chave)) ncm = indice;
    else if (descricao === undefined && ALIASES_DESCRICAO.includes(chave)) descricao = indice;
    else if (mva === undefined && ALIASES_MVA.includes(chave)) mva = indice;
  });

  if (ncm === undefined) return null;
  return { ncm, descricao, mva };
}

/** Converte as linhas cruas (a partir da segunda, pulando o cabeçalho) em entradas de anexo, usando as colunas informadas/detectadas. */
export function parsearAnexo(linhas: LinhaBruta[], colunas: AnexoColunas): LinhaAnexo[] {
  const resultado: LinhaAnexo[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    const ncmBruto = linha[colunas.ncm];
    const ncm = String(ncmBruto ?? "").replace(/\D/g, "");
    if (!ncm) continue;
    // Descarta prefixos curtos demais (< 4 dígitos) ou longos demais (> 8) para
    // ser um NCM/SH real. Isso é uma proteção contra coluna mal mapeada (ex.:
    // número de item em vez de NCM) — um prefixo de 1-2 dígitos combinaria com
    // uma fração enorme de produtos via `startsWith` em `buscarNoAnexo`,
    // forçando ST para itens que não deveriam (ex.: cosméticos NCM 3303-3307
    // sendo capturados por um "3" ou "33" residual de coluna errada).
    if (ncm.length < 4 || ncm.length > 8) continue;

    const descricao =
      colunas.descricao !== undefined ? String(linha[colunas.descricao] ?? "").trim() || undefined : undefined;

    let mva: number | undefined;
    if (colunas.mva !== undefined) {
      const mvaBruto = linha[colunas.mva];
      const n = Number(String(mvaBruto ?? "").trim().replace(",", "."));
      mva = Number.isFinite(n) && String(mvaBruto ?? "").trim() !== "" ? n : undefined;
    }

    resultado.push({ ncm, descricao, mva });
  }
  return resultado;
}

/** Item do anexo que decidiu (ou quase decidiu) o resultado — usado para compor a Observação da linha. */
export interface ItemAnexoDecisao {
  ncm: string;
  descricao?: string;
}

/**
 * Por que um casamento foi rejeitado — usado só para compor a Observação da linha
 * (ver lib/rules.ts), nunca para mudar o resultado final (sempre Tributado normal).
 * - "qualificador_ausente": a Descrição do anexo é altamente específica (ex.: "PARA
 *   PÃES") e nenhum dos qualificadores obrigatórios apareceu no Nome do produto.
 * - "exclusao": o Nome do produto contém uma palavra que indica um uso alternativo do
 *   mesmo NCM (ex.: algodão cosmético em vez de medicinal).
 * - "palavra_chave_ausente": nenhuma palavra-chave (curada ou extraída da Descrição)
 *   apareceu no Nome do produto — o caso genérico já existente antes desta camada.
 */
export type MotivoRejeicaoAnexo =
  | { tipo: "qualificador_ausente"; qualificadores: string[] }
  | { tipo: "exclusao"; palavraExcluida: string }
  | { tipo: "palavra_chave_ausente" };

/**
 * Decisão do casamento de um produto contra os anexos ativos:
 * - "st": achou uma linha de anexo cujo NCM/descrição casa com o produto → é ST.
 *   `item` identifica a linha; `motivoSt` diz se foi por palavra-chave confirmada
 *   no Nome ou porque a linha não tinha descrição útil pra checar (casamento
 *   direto por NCM, comportamento histórico).
 * - "rejeitado": o NCM bateu com uma linha do anexo, mas o Nome do produto não
 *   confirmou (ou foi excluído explicitamente) — decisão de política: NÃO é mais
 *   Dúvida, é tratado como Tributado normal, com `item`/`motivoRejeicao` citados na
 *   Observação para a analista auditar depois (ver lib/rules.ts).
 * - "nao_st": nenhuma linha de nenhum anexo ativo bate com o NCM.
 */
export type DecisaoAnexo =
  | { tipo: "st"; motivoSt: "palavra_chave" | "sem_descricao_util"; item: ItemAnexoDecisao }
  | { tipo: "rejeitado"; item: ItemAnexoDecisao; motivoRejeicao: MotivoRejeicaoAnexo }
  | { tipo: "nao_st" };

/**
 * Verifica se um NCM consta em algum anexo ativo da empresa (usado para decidir ST no
 * Bloco 3) e, quando a linha do anexo tem uma Descrição, exige que o Nome do produto
 * confirme a categoria — NCMs de família ampla (ex.: "1905.90.90") cobrem produtos bem
 * diferentes entre si (pão vs. batata chips), e casar só por prefixo captura os dois.
 *
 * Duas fontes de palavras-chave, nessa ordem:
 * 1. `PALAVRAS_CHAVE_POR_DESCRICAO_ANEXO` (lib/tables.ts) — tabela curada com sinônimos
 *    de marca já validados em ciclos anteriores (ex.: "energy"/"gatorade" para bebidas
 *    energéticas/hidroeletrolíticas, já que o Nome real do produto raramente usa o
 *    termo genérico da lei). Cada entrada curada pode, nessa ordem: (a) exigir um
 *    qualificador obrigatório no Nome (ex.: "pão"/"pães" para misturas de panificação —
 *    sem ele, rejeita antes de olhar mais nada); (b) rejeitar por exclusão se o Nome
 *    contiver uma palavra de uso alternativo do mesmo NCM (ex.: "maquiagem"/"esmalte"
 *    para algodão cosmético vs. medicinal); (c) casar pelos grupos de palavra-chave
 *    já existentes (grupo vazio = a descrição já é suficientemente específica sozinha).
 * 2. Extração automática (`extrairPalavrasChaveDescricao`) — para qualquer outra
 *    Descrição não coberta pela tabela curada (ex.: "Outros pães", "Outros bolos... e
 *    pizzas"). Quando a extração não encontra nenhuma palavra-chave útil (Descrição
 *    vazia ou só com conectivos genéricos), mantém o comportamento histórico: casa
 *    direto por NCM, sem exigir confirmação.
 *
 * Continua varrendo as demais linhas mesmo depois de uma rejeição — um mesmo NCM pode
 * aparecer em mais de um item do anexo (ex.: "Outros pães" e "Outros bolos... pizzas"
 * no mesmo NCM 1905.90.90); só decide "rejeitado" se NENHUMA linha confirmar.
 */
export function buscarNoAnexo(ncmDigitos: string, nomeNormalizado: string, anexosAtivos: AnexoEmpresa[]): DecisaoAnexo {
  if (!ncmDigitos) return { tipo: "nao_st" };
  let candidatoRejeitado: { item: ItemAnexoDecisao; motivoRejeicao: MotivoRejeicaoAnexo } | undefined;

  for (const anexo of anexosAtivos) {
    for (const linha of anexo.linhas) {
      if (!ncmDigitos.startsWith(linha.ncm)) continue;
      const item: ItemAnexoDecisao = { ncm: linha.ncm, descricao: linha.descricao };

      const regraCurada = buscarRegraPalavraChaveAnexo(linha.descricao);
      if (regraCurada) {
        if (regraCurada.qualificadoresObrigatorios && regraCurada.qualificadoresObrigatorios.length > 0) {
          const qualificadorPresente =
            Boolean(nomeNormalizado) && regraCurada.qualificadoresObrigatorios.some((q) => nomeNormalizado.includes(q));
          if (!qualificadorPresente) {
            if (!candidatoRejeitado) {
              candidatoRejeitado = {
                item,
                motivoRejeicao: { tipo: "qualificador_ausente", qualificadores: regraCurada.qualificadoresObrigatorios },
              };
            }
            continue;
          }
        }
        if (regraCurada.exclusoesPorPalavra && regraCurada.exclusoesPorPalavra.length > 0) {
          const palavraExcluida =
            nomeNormalizado ? regraCurada.exclusoesPorPalavra.find((ex) => nomeNormalizado.includes(ex)) : undefined;
          if (palavraExcluida) {
            if (!candidatoRejeitado) {
              candidatoRejeitado = { item, motivoRejeicao: { tipo: "exclusao", palavraExcluida } };
            }
            continue;
          }
        }
        if (regraCurada.gruposPalavraChaveProduto.length === 0) {
          return { tipo: "st", motivoSt: "palavra_chave", item };
        }
        const bateTodosOsGrupos =
          Boolean(nomeNormalizado) &&
          regraCurada.gruposPalavraChaveProduto.every((grupo) => grupo.some((k) => nomeNormalizado.includes(k)));
        if (bateTodosOsGrupos) return { tipo: "st", motivoSt: "palavra_chave", item };
        if (!candidatoRejeitado) candidatoRejeitado = { item, motivoRejeicao: { tipo: "palavra_chave_ausente" } };
        continue;
      }

      const palavrasChave = extrairPalavrasChaveDescricao(linha.descricao);
      if (palavrasChave.length === 0) {
        return { tipo: "st", motivoSt: "sem_descricao_util", item };
      }
      if (nomeContemPalavraChave(nomeNormalizado, palavrasChave)) {
        return { tipo: "st", motivoSt: "palavra_chave", item };
      }
      if (!candidatoRejeitado) candidatoRejeitado = { item, motivoRejeicao: { tipo: "palavra_chave_ausente" } };
    }
  }

  return candidatoRejeitado
    ? { tipo: "rejeitado", item: candidatoRejeitado.item, motivoRejeicao: candidatoRejeitado.motivoRejeicao }
    : { tipo: "nao_st" };
}
