// Leitura de anexos de Substituição Tributária (ou outras listas por NCM)
// enviados pela empresa (Excel ou CSV). Tolerante a variações de
// cabeçalho; quando a detecção automática falha, a interface pede para o
// usuário mapear manualmente as colunas (MapeamentoColunasAnexo.tsx).

import * as XLSX from "xlsx";
import type { AnexoColunas, AnexoEmpresa, LinhaAnexo } from "./empresas";
import { buscarRegraPalavraChaveAnexo } from "./tables";

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

/**
 * Resultado do casamento de um produto contra os anexos ativos:
 * - "st": achou uma linha de anexo cujo NCM/descrição casa com o produto → é ST.
 * - "nao_st": nenhuma linha de anexo casa (nem por prefixo nem por palavra-chave) → não é ST.
 * - "ambiguo": o NCM cai num prefixo amplo de um anexo, mas não há como confirmar
 *   pelo Nome do produto (ou a linha do anexo é ambígua por natureza) — dúvida.
 */
export type ResultadoAnexo = "st" | "nao_st" | "ambiguo";

/**
 * Verifica se um NCM consta em algum anexo ativo da empresa (usado para decidir ST no
 * Bloco 3). NCMs de família ampla (ex.: "2106.9") não bastam sozinhos — quando a
 * descrição da linha do anexo bate com uma entrada conhecida em
 * `PALAVRAS_CHAVE_POR_DESCRICAO_ANEXO` (lib/tables.ts), o Nome do produto precisa
 * conter as palavras-chave exigidas para confirmar o casamento, não importa quantos
 * dígitos o prefixo do anexo tenha (ex.: o item de xarope pré-mix do ST-BA já vem
 * com 7 dígitos, mas ainda cobre só uma fração dos produtos que compartilham esse
 * prefixo).
 *
 * Quando a linha do anexo NÃO tem mapeamento conhecido, o critério é:
 * - Sem descrição alguma (só o código do NCM, como listas de categoria costumam
 *   trazer) → mantém o comportamento histórico: casa direto pelo prefixo, mesmo
 *   curto. Não há texto nenhum para desconfiar, então a lista é o que manda.
 * - Com descrição, mas não reconhecida, e prefixo com menos de 6 dígitos → não dá
 *   pra saber se ela cobre a família toda ou só uma fração — vira "ambiguo"
 *   (dúvida) em vez de assumir ST por conta própria.
 * - Prefixo com 6+ dígitos é tratado como específico o bastante para casar direto,
 *   com ou sem descrição.
 */
export function buscarNoAnexo(
  ncmDigitos: string,
  nomeNormalizado: string,
  anexosAtivos: AnexoEmpresa[]
): ResultadoAnexo {
  if (!ncmDigitos) return "nao_st";
  let algumAmbiguo = false;
  for (const anexo of anexosAtivos) {
    for (const linha of anexo.linhas) {
      if (!ncmDigitos.startsWith(linha.ncm)) continue;
      const regra = buscarRegraPalavraChaveAnexo(linha.descricao);
      if (regra) {
        if (regra.gruposPalavraChaveProduto.length === 0) return "st";
        if (!nomeNormalizado) {
          algumAmbiguo = true;
          continue;
        }
        const bateTodosOsGrupos = regra.gruposPalavraChaveProduto.every((grupo) =>
          grupo.some((k) => nomeNormalizado.includes(k))
        );
        if (bateTodosOsGrupos) return "st";
        continue;
      }
      const temDescricao = Boolean(linha.descricao && linha.descricao.trim());
      if (linha.ncm.length >= 6 || !temDescricao) return "st";
      algumAmbiguo = true;
    }
  }
  return algumAmbiguo ? "ambiguo" : "nao_st";
}
