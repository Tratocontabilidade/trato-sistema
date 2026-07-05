// Leitura de anexos de Substituição Tributária (ou outras listas por NCM)
// enviados pela empresa (Excel ou CSV). Tolerante a variações de
// cabeçalho; quando a detecção automática falha, a interface pede para o
// usuário mapear manualmente as colunas (MapeamentoColunasAnexo.tsx).

import * as XLSX from "xlsx";
import type { AnexoColunas, AnexoEmpresa, LinhaAnexo } from "./empresas";

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

/** Verifica se um NCM consta em algum anexo ativo da empresa (usado para decidir ST no Bloco 3). */
export function buscarNoAnexo(ncmDigitos: string, anexosAtivos: AnexoEmpresa[]): boolean {
  if (!ncmDigitos) return false;
  return anexosAtivos.some((anexo) => anexo.linhas.some((l) => ncmDigitos.startsWith(l.ncm)));
}
