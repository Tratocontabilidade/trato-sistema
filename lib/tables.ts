// Tabelas de referência fiscal usadas pelo motor de regras (lib/rules.ts).
//
// Este arquivo é isolado da interface de propósito: novas exceções por NCM,
// atualizações de alíquota ou novas versões da tabela de cClassTrib devem ser
// adicionadas aqui (ou em `ncmExcecoes`, em lib/rules.ts) sem tocar em app/.
//
// Fontes:
// - CFOP: Ajuste SINIEF 07/2001 e RICMS-BA (Decreto nº 13.780/2012, Anexo I - ST).
// - CST PIS/COFINS: IN RFB nº 2.121/2022, Anexo I (saídas) e Anexo II (entradas).
// - CST IBS/CBS e cClassTrib: LC nº 214/2025 e Informe Técnico NF-e 2025.002
//   (Portal Nacional da NF-e). Tabela sujeita a novas versões — confirme sempre
//   a edição vigente no Portal Nacional da NF-e antes de emitir documentos fiscais.

import type { CodigoDescricao, ClassTrib } from "./types";

/** Tabela CFOP (apenas os códigos usados pelo motor de regras deste sistema). */
export const CFOP: Record<string, CodigoDescricao> = {
  "5102": { codigo: "5.102", descricao: "Venda de mercadoria adquirida ou recebida de terceiros" },
  "6102": { codigo: "6.102", descricao: "Venda de mercadoria adquirida ou recebida de terceiros" },
  "5405": {
    codigo: "5.405",
    descricao:
      "Venda de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária, na condição de contribuinte substituído",
  },
  "6404": {
    codigo: "6.404",
    descricao:
      "Venda de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária, na condição de contribuinte substituído",
  },
  "5202": { codigo: "5.202", descricao: "Devolução de compra para comercialização" },
  "6202": { codigo: "6.202", descricao: "Devolução de compra para comercialização" },
  "5411": {
    codigo: "5.411",
    descricao:
      "Devolução de compra de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária",
  },
  "6411": {
    codigo: "6.411",
    descricao:
      "Devolução de compra de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária",
  },
  "1202": { codigo: "1.202", descricao: "Devolução de venda de mercadoria adquirida ou recebida de terceiros" },
  "2202": { codigo: "2.202", descricao: "Devolução de venda de mercadoria adquirida ou recebida de terceiros" },
  "5152": { codigo: "5.152", descricao: "Transferência de mercadoria adquirida ou recebida de terceiros" },
  "6152": { codigo: "6.152", descricao: "Transferência de mercadoria adquirida ou recebida de terceiros" },
  "5409": {
    codigo: "5.409",
    descricao:
      "Transferência de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária",
  },
  "6409": {
    codigo: "6.409",
    descricao:
      "Transferência de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária",
  },
  "5910": { codigo: "5.910", descricao: "Remessa em bonificação, doação ou brinde" },
  "6910": { codigo: "6.910", descricao: "Remessa em bonificação, doação ou brinde" },
  "5915": { codigo: "5.915", descricao: "Remessa de mercadoria ou bem para conserto ou reparo" },
  "6915": { codigo: "6.915", descricao: "Remessa de mercadoria ou bem para conserto ou reparo" },
  "5916": { codigo: "5.916", descricao: "Retorno de mercadoria ou bem recebido para conserto ou reparo" },
  "6916": { codigo: "6.916", descricao: "Retorno de mercadoria ou bem recebido para conserto ou reparo" },
  "1102": { codigo: "1.102", descricao: "Compra para comercialização" },
  "2102": { codigo: "2.102", descricao: "Compra para comercialização" },
  "1403": {
    codigo: "1.403",
    descricao: "Compra para comercialização, em operação com mercadoria sujeita ao regime de substituição tributária",
  },
  "2403": {
    codigo: "2.403",
    descricao: "Compra para comercialização, em operação com mercadoria sujeita ao regime de substituição tributária",
  },
};

/** CFOP genérico usado quando o destino é exportação (fora do escopo do motor padrão). */
export const CFOP_EXPORTACAO: CodigoDescricao = {
  codigo: "7.xxx",
  descricao:
    "Operação de exportação — definir o CFOP 7.xxx específico conforme a natureza da operação (ex.: 7.101/7.102 para venda)",
};

/** CFOP genérico usado quando a entrada vem do exterior (importação/devolução de exportação, fora do escopo do motor padrão). */
export const CFOP_IMPORTACAO: CodigoDescricao = {
  codigo: "3.xxx",
  descricao:
    "Operação de importação ou devolução de exportação — definir o CFOP 3.xxx específico conforme a natureza da operação",
};

/** Tabela de CST de PIS e COFINS — IN RFB nº 2.121/2022. */
export const CST_PIS_COFINS: Record<string, CodigoDescricao> = {
  // Anexo I — operações de saída (receitas)
  "01": { codigo: "01", descricao: "Operação Tributável com Alíquota Básica" },
  "02": { codigo: "02", descricao: "Operação Tributável com Alíquota Diferenciada" },
  "03": { codigo: "03", descricao: "Operação Tributável com Alíquota por Unidade de Medida de Produto" },
  "04": { codigo: "04", descricao: "Operação Tributável Monofásica — Revenda a Alíquota Zero" },
  "05": { codigo: "05", descricao: "Operação Tributável por Substituição Tributária" },
  "06": { codigo: "06", descricao: "Operação Tributável a Alíquota Zero" },
  "07": { codigo: "07", descricao: "Operação Isenta da Contribuição" },
  "08": { codigo: "08", descricao: "Operação sem Incidência da Contribuição" },
  "09": { codigo: "09", descricao: "Operação com Suspensão da Contribuição" },
  "49": { codigo: "49", descricao: "Outras Operações de Saída" },
  // Anexo II — operações de entrada (créditos e aquisições)
  "50": {
    codigo: "50",
    descricao: "Operação com Direito a Crédito — Vinculada Exclusivamente a Receita Tributada no Mercado Interno",
  },
  "51": {
    codigo: "51",
    descricao: "Operação com Direito a Crédito — Vinculada Exclusivamente a Receita Não Tributada no Mercado Interno",
  },
  "52": { codigo: "52", descricao: "Operação com Direito a Crédito — Vinculada Exclusivamente a Receita de Exportação" },
  "53": {
    codigo: "53",
    descricao: "Operação com Direito a Crédito — Vinculada a Receitas Tributadas e Não Tributadas no Mercado Interno",
  },
  "54": {
    codigo: "54",
    descricao: "Operação com Direito a Crédito — Vinculada a Receitas Tributadas no Mercado Interno e de Exportação",
  },
  "55": {
    codigo: "55",
    descricao:
      "Operação com Direito a Crédito — Vinculada a Receitas Não Tributadas no Mercado Interno e de Exportação",
  },
  "56": {
    codigo: "56",
    descricao:
      "Operação com Direito a Crédito — Vinculada a Receitas Tributadas e Não Tributadas no Mercado Interno, e de Exportação",
  },
  "60": {
    codigo: "60",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada Exclusivamente a Receita Tributada no Mercado Interno",
  },
  "61": {
    codigo: "61",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada Exclusivamente a Receita Não Tributada no Mercado Interno",
  },
  "62": {
    codigo: "62",
    descricao: "Crédito Presumido — Operação de Aquisição Vinculada Exclusivamente a Receita de Exportação",
  },
  "63": {
    codigo: "63",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada a Receitas Tributadas e Não Tributadas no Mercado Interno",
  },
  "64": {
    codigo: "64",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada a Receitas Tributadas no Mercado Interno e de Exportação",
  },
  "65": {
    codigo: "65",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada a Receitas Não Tributadas no Mercado Interno e de Exportação",
  },
  "66": {
    codigo: "66",
    descricao:
      "Crédito Presumido — Operação de Aquisição Vinculada a Receitas Tributadas e Não Tributadas no Mercado Interno, e de Exportação",
  },
  "70": { codigo: "70", descricao: "Operação de Aquisição sem Direito a Crédito" },
  "71": { codigo: "71", descricao: "Operação de Aquisição com Isenção" },
  "72": { codigo: "72", descricao: "Operação de Aquisição com Suspensão" },
  "73": { codigo: "73", descricao: "Operação de Aquisição a Alíquota Zero" },
  "74": { codigo: "74", descricao: "Operação de Aquisição sem Incidência da Contribuição" },
  "75": { codigo: "75", descricao: "Operação de Aquisição por Substituição Tributária" },
  "98": { codigo: "98", descricao: "Outras Operações de Entrada" },
  "99": { codigo: "99", descricao: "Outras Operações" },
};

/**
 * Tabela de CST do IBS/CBS e cClassTrib — LC nº 214/2025 e Informe Técnico
 * NF-e 2025.002. Lista não exaustiva: cobre os grupos citados no briefing do
 * projeto. Ao identificar um cClassTrib específico de algum anexo (ex.: cesta
 * básica, medicamentos, etc.), adicione a entrada correspondente aqui.
 */
export const CST_IBS_CBS: Record<string, CodigoDescricao> = {
  "000": { codigo: "000", descricao: "Tributação integral" },
  "010": { codigo: "010", descricao: "Tributação do setor financeiro" },
  "011": { codigo: "011", descricao: "Tributação do setor financeiro — operações específicas" },
  "200": { codigo: "200", descricao: "Alíquota reduzida" },
  "400": { codigo: "400", descricao: "Isenção" },
  "410": { codigo: "410", descricao: "Imunidade / não incidência" },
  "510": { codigo: "510", descricao: "Diferimento" },
  "515": { codigo: "515", descricao: "Diferimento — hipótese específica" },
  "550": { codigo: "550", descricao: "Suspensão" },
  "620": { codigo: "620", descricao: "Tributação monofásica" },
  "800": { codigo: "800", descricao: "Transferência de crédito" },
  "810": { codigo: "810", descricao: "Ajuste de base de cálculo ou de imposto — a maior" },
  "811": { codigo: "811", descricao: "Ajuste de base de cálculo ou de imposto — a menor" },
  "820": { codigo: "820", descricao: "Operação registrada em documento fiscal específico" },
  "830": { codigo: "830", descricao: "Exclusão de valor da base de cálculo" },
};

export const CCLASSTRIB_PADRAO: ClassTrib = {
  codigo: "000001",
  descricao: "Tributação integral, sem incentivo, benefício ou diferimento",
  baseLegal: "LC nº 214/2025; Informe Técnico NF-e 2025.002 (tabela de cClassTrib)",
};
