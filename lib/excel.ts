// Leitura da planilha de entrada e geração da planilha de saída, usando
// SheetJS (xlsx). Todo o processamento acontece no navegador — nenhum
// arquivo é enviado a um servidor.

import * as XLSX from "xlsx";
import type {
  Destinatario,
  Destino,
  ProdutoEntrada,
  ProdutoResultado,
  SimNaoVerificar,
  TipoOperacao,
} from "./types";

const NOME_ABA_ENTRADA = "Produtos";

const REGEX_DIACRITICOS = /[\u0300-\u036f]/g;

function normalizarChave(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Lê um campo de uma linha buscando entre vários nomes de coluna possíveis (tolerante a acento/maiúsculas). */
function campo(linha: Record<string, unknown>, ...aliases: string[]): string {
  const chaves = new Map<string, unknown>();
  for (const [k, v] of Object.entries(linha)) {
    chaves.set(normalizarChave(k), v);
  }
  for (const alias of aliases) {
    const valor = chaves.get(normalizarChave(alias));
    if (valor !== undefined) return String(valor).trim();
  }
  return "";
}

const MAPA_TIPO_OPERACAO: Record<string, TipoOperacao> = {
  venda: "venda",
  compra: "compra",
  devolucao_compra: "devolucao_compra",
  devolucao_de_compra: "devolucao_compra",
  devolucao_venda: "devolucao_venda",
  devolucao_de_venda: "devolucao_venda",
  transferencia: "transferencia",
  bonificacao_doacao: "bonificacao_doacao",
  bonificacao_e_doacao: "bonificacao_doacao",
  bonificacao: "bonificacao_doacao",
  doacao: "bonificacao_doacao",
  remessa_conserto: "remessa_conserto",
  remessa_para_conserto: "remessa_conserto",
  retorno_conserto: "retorno_conserto",
  retorno_de_conserto: "retorno_conserto",
};

const MAPA_DESTINO: Record<string, Destino> = {
  interna: "interna",
  interestadual: "interestadual",
  exportacao: "exportacao",
};

const MAPA_DESTINATARIO: Record<string, Destinatario> = {
  consumidor_final: "consumidor_final",
  contribuinte: "contribuinte",
  orgao_publico: "orgao_publico",
};

const MAPA_SIM_NAO: Record<string, SimNaoVerificar> = {
  sim: "sim",
  s: "sim",
  yes: "sim",
  nao: "nao",
  n: "nao",
  no: "nao",
  verificar: "verificar",
  "": "verificar",
};

function paraSimNaoVerificar(valor: string): SimNaoVerificar {
  return MAPA_SIM_NAO[normalizarChave(valor)] ?? "verificar";
}

export interface LeituraPlanilha {
  produtos: ProdutoEntrada[];
  erros: string[];
}

/** Lê um ArrayBuffer de planilha .xlsx e retorna os produtos normalizados + erros de linha. */
export function lerPlanilhaProdutos(dados: ArrayBuffer): LeituraPlanilha {
  const workbook = XLSX.read(dados, { type: "array" });
  const nomeAba = workbook.SheetNames.includes(NOME_ABA_ENTRADA)
    ? NOME_ABA_ENTRADA
    : workbook.SheetNames[0];
  const aba = workbook.Sheets[nomeAba];
  if (!aba) {
    return { produtos: [], erros: [`A planilha não contém nenhuma aba de dados.`] };
  }

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: "" });

  const produtos: ProdutoEntrada[] = [];
  const erros: string[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // linha 1 = cabeçalho
    const codigo = campo(linha, "Código", "Codigo");
    const descricao = campo(linha, "Descrição", "Descricao");
    const ncmBruto = campo(linha, "NCM");
    const ncm = ncmBruto.replace(/\D/g, "");
    const tipoOperacaoBruto = campo(linha, "Tipo Operação", "Tipo Operacao", "Tipo de Operação");
    const destinoBruto = campo(linha, "Destino");
    const destinatarioBruto = campo(linha, "Destinatário", "Destinatario");
    const origem = campo(linha, "Origem");
    const stBahia = campo(linha, "ST Bahia", "ST BA");
    const monofasico = campo(linha, "Monofásico PIS/COFINS", "Monofasico PIS/COFINS", "Monofásico PIS COFINS");
    const isento = campo(linha, "Isento PIS/COFINS", "Isento PIS COFINS");
    const anexoLc214 = campo(linha, "Anexo LC 214/2025", "Anexo LC 214", "Anexo LC214/2025");

    if (!codigo && !descricao && !ncmBruto && !tipoOperacaoBruto) {
      return; // linha em branco — ignora silenciosamente
    }

    const problemasLinha: string[] = [];
    if (!codigo) problemasLinha.push("Código ausente");
    if (!descricao) problemasLinha.push("Descrição ausente");
    if (!/^\d{8}$/.test(ncm)) problemasLinha.push(`NCM inválido ("${ncmBruto}") — informe 8 dígitos`);

    const tipoOperacao = MAPA_TIPO_OPERACAO[normalizarChave(tipoOperacaoBruto)];
    if (!tipoOperacao) problemasLinha.push(`Tipo Operação não reconhecido: "${tipoOperacaoBruto}"`);

    const destino = MAPA_DESTINO[normalizarChave(destinoBruto)];
    if (!destino) problemasLinha.push(`Destino não reconhecido: "${destinoBruto}"`);

    const destinatario = MAPA_DESTINATARIO[normalizarChave(destinatarioBruto)] ?? "contribuinte";

    if (problemasLinha.length > 0) {
      erros.push(`Linha ${numeroLinha}: ${problemasLinha.join("; ")}`);
      return;
    }

    produtos.push({
      codigo,
      descricao,
      ncm,
      origem,
      tipoOperacao: tipoOperacao!,
      destino: destino!,
      destinatario,
      stBahia: paraSimNaoVerificar(stBahia),
      monofasicoPisCofins: paraSimNaoVerificar(monofasico),
      isentoPisCofins: paraSimNaoVerificar(isento),
      anexoLc214: paraSimNaoVerificar(anexoLc214),
      linha: numeroLinha,
    });
  });

  return { produtos, erros };
}

const CABECALHO_SAIDA = [
  "Código",
  "Descrição",
  "NCM",
  "CFOP",
  "CFOP - Descrição",
  "CST PIS",
  "CST PIS - Descrição",
  "CST COFINS",
  "CST COFINS - Descrição",
  "CST IBS/CBS",
  "CST IBS/CBS - Descrição",
  "cClassTrib",
  "cClassTrib - Descrição",
  "cClassTrib - Base Legal",
  "Alertas",
];

function formatarAlertas(resultado: ProdutoResultado): string {
  if (resultado.alertas.length === 0) return "";
  return resultado.alertas
    .map((a) => `[${a.campo}] ${a.mensagem} (${a.norma})`)
    .join(" | ");
}

/** Gera o arquivo .xlsx de saída a partir dos resultados classificados. */
export function gerarPlanilhaResultado(resultados: ProdutoResultado[]): Uint8Array {
  const linhas = resultados.map((r) => [
    r.codigo,
    r.descricao,
    r.ncm,
    r.cfop.codigo,
    r.cfop.descricao,
    r.cstPis.codigo,
    r.cstPis.descricao,
    r.cstCofins.codigo,
    r.cstCofins.descricao,
    r.cstIbsCbs.codigo,
    r.cstIbsCbs.descricao,
    r.cClassTrib.codigo,
    r.cClassTrib.descricao,
    r.cClassTrib.baseLegal,
    formatarAlertas(r),
  ]);

  const aba = XLSX.utils.aoa_to_sheet([CABECALHO_SAIDA, ...linhas]);
  aba["!cols"] = [
    { wch: 12 }, // Código
    { wch: 30 }, // Descrição
    { wch: 10 }, // NCM
    { wch: 8 }, // CFOP
    { wch: 40 }, // CFOP descrição
    { wch: 8 }, // CST PIS
    { wch: 40 }, // CST PIS descrição
    { wch: 10 }, // CST COFINS
    { wch: 40 }, // CST COFINS descrição
    { wch: 10 }, // CST IBS/CBS
    { wch: 30 }, // CST IBS/CBS descrição
    { wch: 10 }, // cClassTrib
    { wch: 40 }, // cClassTrib descrição
    { wch: 40 }, // cClassTrib base legal
    { wch: 80 }, // Alertas
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, aba, "Grade Tributária");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
