// Leitura e geração da planilha "Cadastro de Produtos" (layout fixo dos
// clientes do escritório), usando SheetJS (xlsx). Aceita .xls e .xlsx — o
// SheetJS detecta o formato automaticamente a partir do conteúdo do
// arquivo. Todo o processamento acontece no navegador.

import * as XLSX from "xlsx";
import type { ClientProdutoEntrada, ClientProdutoResultado } from "./types";

const REGEX_DIACRITICOS = /[\u0300-\u036f]/g;

function normalizarChaveCabecalho(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Ordem fixa das 19 colunas do layout do cliente. `chave` é o cabeçalho normalizado; `campo` é a propriedade correspondente em ClientProdutoEntrada/Resultado. */
const COLUNAS_ESPERADAS = [
  { chave: "codigo", campo: "codigo" },
  { chave: "nome", campo: "nome" },
  { chave: "codigodebarras", campo: "codigoBarras" },
  { chave: "un", campo: "un" },
  { chave: "tributacao", campo: "tributacao" },
  { chave: "precounit", campo: "precoUnit" },
  { chave: "ncm", campo: "ncm" },
  { chave: "cfopsaidas", campo: "cfopSaidas" },
  { chave: "aliqfcp", campo: "aliqFcp" },
  { chave: "csticms", campo: "cstIcms" },
  { chave: "cstpiscofins", campo: "cstPisCofins" },
  { chave: "pis", campo: "pis" },
  { chave: "cofins", campo: "cofins" },
  { chave: "natrecieta", campo: "natReceita" },
  { chave: "cstibscbs", campo: "cstIbsCbs" },
  { chave: "cclasstrib", campo: "cclasstrib" },
  { chave: "redbc", campo: "redBc" },
  { chave: "ibs", campo: "ibs" },
  { chave: "cbs", campo: "cbs" },
] as const;

type LinhaBruta = (string | number)[];

interface Merge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface PlanilhaClienteContexto {
  nomeAba: string;
  tituloOriginal: string;
  cabecalhoOriginal: LinhaBruta;
  mapaColunas: Record<string, number>;
  mergeTitulo: Merge | null;
}

function paraNumeroOuNull(bruto: unknown): number | null {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  const texto = String(bruto).trim().replace(",", ".");
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function textoCelula(linha: LinhaBruta, indice: number | undefined): string {
  if (indice === undefined) return "";
  const v = linha[indice];
  return v === null || v === undefined ? "" : String(v).trim();
}

function detectarAba(workbook: XLSX.WorkBook): PlanilhaClienteContexto | null {
  for (const nomeAba of workbook.SheetNames) {
    const sheet = workbook.Sheets[nomeAba];
    if (!sheet) continue;

    const linhas = XLSX.utils.sheet_to_json<LinhaBruta>(sheet, { header: 1, defval: "", raw: true });
    if (linhas.length < 2) continue;

    const cabecalho = linhas[1] ?? [];
    const mapaColunas: Record<string, number> = {};
    cabecalho.forEach((celula, indice) => {
      const chave = normalizarChaveCabecalho(celula);
      if (chave) mapaColunas[chave] = indice;
    });

    const todasPresentes = COLUNAS_ESPERADAS.every((c) => mapaColunas[c.chave] !== undefined);
    if (!todasPresentes) continue;

    const tituloOriginal = String(linhas[0]?.[0] ?? "").trim();
    const merges = ((sheet["!merges"] as Merge[] | undefined) ?? []).filter((m) => m.s.r === 0);

    return {
      nomeAba,
      tituloOriginal,
      cabecalhoOriginal: cabecalho,
      mapaColunas,
      mergeTitulo: merges[0] ?? null,
    };
  }
  return null;
}

export interface LeituraPlanilhaCliente {
  produtos: ClientProdutoEntrada[];
  erros: string[];
  contexto: PlanilhaClienteContexto | null;
}

/** Lê um ArrayBuffer de planilha .xls/.xlsx no layout "Cadastro de Produtos". */
export function lerPlanilhaCliente(dados: ArrayBuffer): LeituraPlanilhaCliente {
  const workbook = XLSX.read(dados, { type: "array" });
  const contexto = detectarAba(workbook);

  if (!contexto) {
    return {
      produtos: [],
      erros: [
        'Nenhuma aba com as 19 colunas esperadas do "Cadastro de Produtos" foi encontrada (verifique se o cabeçalho está na linha 2).',
      ],
      contexto: null,
    };
  }

  const sheet = workbook.Sheets[contexto.nomeAba];
  const linhas = XLSX.utils.sheet_to_json<LinhaBruta>(sheet, { header: 1, defval: "", raw: true });
  const dadosLinhas = linhas.slice(2); // linha 1 = título, linha 2 = cabeçalho

  const produtos: ClientProdutoEntrada[] = [];
  const erros: string[] = [];
  const m = contexto.mapaColunas;

  dadosLinhas.forEach((linha, indice) => {
    const numeroLinha = indice + 3;
    const vazia = linha.every((c) => c === null || c === undefined || String(c).trim() === "");
    if (vazia) return;

    const ncmOriginal = textoCelula(linha, m.ncm);

    produtos.push({
      linha: numeroLinha,
      codigo: linha[m.codigo] ?? "",
      nome: linha[m.nome] ?? "",
      codigoBarras: linha[m.codigodebarras] ?? "",
      un: linha[m.un] ?? "",
      precoUnit: linha[m.precounit] ?? "",
      aliqFcp: linha[m.aliqfcp] ?? "",
      tributacao: textoCelula(linha, m.tributacao),
      ncmOriginal,
      ncm: ncmOriginal.replace(/\D/g, ""),
      cfopSaidas: textoCelula(linha, m.cfopsaidas),
      cstIcms: textoCelula(linha, m.csticms),
      cstPisCofins: textoCelula(linha, m.cstpiscofins),
      pis: paraNumeroOuNull(linha[m.pis]),
      cofins: paraNumeroOuNull(linha[m.cofins]),
      natReceita: textoCelula(linha, m.natrecieta),
      cstIbsCbs: textoCelula(linha, m.cstibscbs),
      cclasstrib: textoCelula(linha, m.cclasstrib),
      redBc: paraNumeroOuNull(linha[m.redbc]),
      ibs: paraNumeroOuNull(linha[m.ibs]),
      cbs: paraNumeroOuNull(linha[m.cbs]),
    });
  });

  if (produtos.length === 0 && erros.length === 0) {
    erros.push("A planilha não contém linhas de produtos a partir da linha 3.");
  }

  return { produtos, erros, contexto };
}

function valorParaCelula(campo: string, r: ClientProdutoResultado): string | number {
  switch (campo) {
    case "codigo":
      return r.codigo;
    case "nome":
      return r.nome;
    case "codigoBarras":
      return r.codigoBarras;
    case "un":
      return r.un;
    case "tributacao":
      return r.tributacao;
    case "precoUnit":
      return r.precoUnit;
    case "ncm":
      return r.ncmOriginal;
    case "cfopSaidas":
      return r.cfopSaidas;
    case "aliqFcp":
      return r.aliqFcp;
    case "cstIcms":
      return r.cstIcms;
    case "cstPisCofins":
      return r.cstPisCofins;
    case "pis":
      return r.pis ?? "";
    case "cofins":
      return r.cofins ?? "";
    case "natReceita":
      return r.natReceita;
    case "cstIbsCbs":
      return r.cstIbsCbs;
    case "cclasstrib":
      return r.cclasstrib;
    case "redBc":
      return r.redBc ?? "";
    case "ibs":
      return r.ibs ?? "";
    case "cbs":
      return r.cbs ?? "";
    default:
      return "";
  }
}

/** Gera o .xlsx de saída no mesmo layout de entrada (título mesclado + cabeçalho intactos), com Status e Observação ao final. */
export function gerarPlanilhaClienteResultado(
  resultados: ClientProdutoResultado[],
  contexto: PlanilhaClienteContexto
): ArrayBuffer {
  const numColunasOriginais = contexto.cabecalhoOriginal.length;
  const numColunas = numColunasOriginais + 2;

  const linhaTitulo: LinhaBruta = new Array(numColunas).fill("");
  linhaTitulo[0] = contexto.tituloOriginal;

  const linhaCabecalho: LinhaBruta = [...contexto.cabecalhoOriginal, "Status", "Observação"];

  const linhasDados: LinhaBruta[] = resultados.map((r) => {
    const linha: LinhaBruta = new Array(numColunas).fill("");
    for (const { chave, campo } of COLUNAS_ESPERADAS) {
      const indice = contexto.mapaColunas[chave];
      linha[indice] = valorParaCelula(campo, r);
    }
    linha[numColunasOriginais] = r.status;
    linha[numColunasOriginais + 1] = r.observacao;
    return linha;
  });

  const sheet = XLSX.utils.aoa_to_sheet([linhaTitulo, linhaCabecalho, ...linhasDados]);
  if (contexto.mergeTitulo) {
    sheet["!merges"] = [contexto.mergeTitulo];
  }
  sheet["!cols"] = new Array(numColunas).fill({ wch: 16 });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, contexto.nomeAba);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
