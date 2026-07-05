// Motor de decisão fiscal — Grade Tributária BA.
//
// Este módulo não depende da interface (app/). Recebe um `ProdutoEntrada` já
// normalizado (ver lib/excel.ts) e devolve um `ProdutoResultado` com CFOP,
// CST de PIS/COFINS, CST de IBS/CBS, cClassTrib e a lista de alertas.
//
// Princípio geral: nunca cravar uma classificação sensível (ST, monofasia,
// benefício fiscal, imunidade) sem confirmação explícita ("sim"/"nao"). Campos
// "verificar" ou vazios recebem a classificação padrão mais conservadora e um
// alerta citando a norma que motiva a dúvida.

import {
  CFOP,
  CFOP_EXPORTACAO,
  CFOP_IMPORTACAO,
  CST_PIS_COFINS,
  CST_IBS_CBS,
  CCLASSTRIB_PADRAO,
} from "./tables";
import type {
  Alerta,
  ClassTrib,
  CodigoDescricao,
  ProdutoEntrada,
  ProdutoResultado,
  TipoOperacao,
} from "./types";

const NORMA_ST_BAHIA = "RICMS-BA (Decreto nº 13.780/2012), Anexo I — Substituição Tributária";
const NORMA_PIS_COFINS = "Lei nº 10.637/2002; Lei nº 10.833/2003; IN RFB nº 2.121/2022";
const NORMA_LC214 = "LC nº 214/2025; Informe Técnico NF-e 2025.002 (Portal Nacional da NF-e)";

const OPERACOES_SAIDA: ReadonlySet<TipoOperacao> = new Set([
  "venda",
  "devolucao_compra",
  "transferencia",
  "bonificacao_doacao",
  "remessa_conserto",
  "retorno_conserto",
]);

/** Operações que possuem uma variante de CFOP específica para Substituição Tributária. */
const OPERACOES_COM_VARIANTE_ST: ReadonlySet<TipoOperacao> = new Set([
  "venda",
  "compra",
  "devolucao_compra",
  "transferencia",
]);

function direcao(tipo: TipoOperacao): "saida" | "entrada" {
  return OPERACOES_SAIDA.has(tipo) ? "saida" : "entrada";
}

/**
 * Exceções e regras específicas por NCM. Comece vazio e adicione entradas
 * conforme casos reais forem identificados na prática (ex.: produtos
 * monofásicos, produtos com ST convenial, itens de anexos específicos da
 * LC nº 214/2025). Uma entrada aqui tem prioridade sobre o padrão do motor.
 */
export interface NcmExcecao {
  cstPis?: string;
  cstCofins?: string;
  cstIbsCbs?: string;
  cClassTrib?: ClassTrib;
  observacao: string;
  norma: string;
}

export const ncmExcecoes: Record<string, NcmExcecao> = {
  // Exemplo de como adicionar uma exceção (mantido comentado como referência):
  // "22021000": {
  //   cstPis: "04",
  //   cstCofins: "04",
  //   observacao: "Refrigerantes: tributação monofásica de PIS/COFINS na revenda.",
  //   norma: "Lei nº 13.097/2015, art. 14",
  // },
};

function cfopChave(prefixo: string, sufixo: string): CodigoDescricao {
  const entrada = CFOP[`${prefixo}${sufixo}`];
  if (!entrada) {
    throw new Error(`CFOP não cadastrado para prefixo ${prefixo} e sufixo ${sufixo}`);
  }
  return entrada;
}

interface ResultadoCfop {
  cfop: CodigoDescricao;
  alertas: Alerta[];
}

function resolverComST(input: ProdutoEntrada): { comST: boolean; alerta?: Alerta } {
  if (input.stBahia === "sim") return { comST: true };
  if (input.stBahia === "nao") return { comST: false };
  return {
    comST: false,
    alerta: {
      campo: "ST Bahia",
      mensagem:
        "Substituição Tributária de ICMS não confirmada para este item. O motor aplicou, por padrão conservador, o CFOP sem ST — confirme o enquadramento do NCM antes de emitir o documento fiscal.",
      norma: NORMA_ST_BAHIA,
    },
  };
}

function resolverCfop(input: ProdutoEntrada): ResultadoCfop {
  const alertas: Alerta[] = [];
  const { comST, alerta: alertaST } = resolverComST(input);
  const usaVarianteST = OPERACOES_COM_VARIANTE_ST.has(input.tipoOperacao);

  if (comST && !usaVarianteST) {
    alertas.push({
      campo: "ST Bahia",
      mensagem:
        "ST Bahia foi marcada como 'sim', mas este tipo de operação não possui uma variante de CFOP específica de ST neste motor. Revise manualmente o CFOP.",
      norma: NORMA_ST_BAHIA,
    });
  } else if (alertaST && usaVarianteST) {
    alertas.push(alertaST);
  }

  const direcaoOperacao = direcao(input.tipoOperacao);

  if (input.destino === "exportacao") {
    if (direcaoOperacao === "saida") {
      alertas.push({
        campo: "CFOP",
        mensagem:
          "Destino de exportação: defina o CFOP 7.xxx específico da operação (fora do escopo automático deste motor).",
        norma: "Ajuste SINIEF 07/2001 (tabela de CFOP)",
      });
      return { cfop: CFOP_EXPORTACAO, alertas };
    }
    alertas.push({
      campo: "CFOP",
      mensagem:
        "Entrada com origem no exterior (importação/devolução de exportação): defina o CFOP 3.xxx específico (fora do escopo automático deste motor).",
      norma: "Ajuste SINIEF 07/2001 (tabela de CFOP)",
    });
    return { cfop: CFOP_IMPORTACAO, alertas };
  }

  const prefixo = direcaoOperacao === "saida"
    ? (input.destino === "interna" ? "5" : "6")
    : (input.destino === "interna" ? "1" : "2");

  switch (input.tipoOperacao) {
    case "venda": {
      if (!comST) return { cfop: cfopChave(prefixo, "102"), alertas };
      // Exceção da tabela oficial de CFOP: venda com ST usa sufixo 405 (interna) / 404 (interestadual).
      return { cfop: cfopChave(prefixo, prefixo === "5" ? "405" : "404"), alertas };
    }
    case "compra":
      return { cfop: comST ? cfopChave(prefixo, "403") : cfopChave(prefixo, "102"), alertas };
    case "devolucao_compra":
      return { cfop: comST ? cfopChave(prefixo, "411") : cfopChave(prefixo, "202"), alertas };
    case "devolucao_venda":
      return { cfop: cfopChave(prefixo, "202"), alertas };
    case "transferencia":
      return { cfop: comST ? cfopChave(prefixo, "409") : cfopChave(prefixo, "152"), alertas };
    case "bonificacao_doacao":
      return { cfop: cfopChave(prefixo, "910"), alertas };
    case "remessa_conserto":
      return { cfop: cfopChave(prefixo, "915"), alertas };
    case "retorno_conserto":
      return { cfop: cfopChave(prefixo, "916"), alertas };
    default: {
      const _exhaustive: never = input.tipoOperacao;
      throw new Error(`Tipo de operação não tratado: ${_exhaustive}`);
    }
  }
}

interface ResultadoPisCofins {
  cst: CodigoDescricao;
  alertas: Alerta[];
}

function resolverCstPisCofins(input: ProdutoEntrada): ResultadoPisCofins {
  const alertas: Alerta[] = [];
  const direcaoOperacao = direcao(input.tipoOperacao);

  if (input.isentoPisCofins === "verificar") {
    alertas.push({
      campo: "Isento PIS/COFINS",
      mensagem: "Isenção de PIS/COFINS não confirmada para este NCM — confirme antes de emitir o documento fiscal.",
      norma: NORMA_PIS_COFINS,
    });
  }
  if (input.monofasicoPisCofins === "verificar") {
    alertas.push({
      campo: "Monofásico PIS/COFINS",
      mensagem:
        "Tributação monofásica de PIS/COFINS não confirmada para este NCM — confirme na lista de produtos monofásicos antes de emitir o documento fiscal.",
      norma: NORMA_PIS_COFINS,
    });
  }
  if (input.isentoPisCofins === "sim" && input.monofasicoPisCofins === "sim") {
    alertas.push({
      campo: "Isento / Monofásico PIS/COFINS",
      mensagem:
        "Item marcado simultaneamente como isento e monofásico. O motor priorizou a isenção — revise manualmente qual condição prevalece.",
      norma: NORMA_PIS_COFINS,
    });
  }

  if (direcaoOperacao === "saida") {
    if (input.isentoPisCofins === "sim") {
      return { cst: CST_PIS_COFINS["07"], alertas };
    }
    if (input.monofasicoPisCofins === "sim") {
      return { cst: CST_PIS_COFINS["04"], alertas };
    }
    return { cst: CST_PIS_COFINS["01"], alertas };
  }

  // Entrada (compra, devolução de venda): Anexo II da IN RFB nº 2.121/2022.
  if (input.isentoPisCofins === "sim") {
    return { cst: CST_PIS_COFINS["71"], alertas };
  }
  if (input.monofasicoPisCofins === "sim") {
    alertas.push({
      campo: "Monofásico PIS/COFINS",
      mensagem:
        "Aquisição de produto monofásico: em regra não há direito a crédito de PIS/COFINS pelo revendedor. Confirme antes de emitir/escriturar.",
      norma: NORMA_PIS_COFINS,
    });
    return { cst: CST_PIS_COFINS["70"], alertas };
  }
  alertas.push({
    campo: "CST PIS/COFINS (entrada)",
    mensagem:
      "Confirme o regime de apuração (Lucro Real ou Presumido) para definir se há direito a crédito de PIS/COFINS (CST 50 a 56) ou não (CST 70) sobre esta aquisição. O motor aplicou 'Outras Operações de Entrada' como padrão neutro.",
    norma: NORMA_PIS_COFINS + ", Anexo II",
  });
  return { cst: CST_PIS_COFINS["98"], alertas };
}

interface ResultadoIbsCbs {
  cst: CodigoDescricao;
  cClassTrib: ClassTrib;
  alertas: Alerta[];
}

function resolverIbsCbs(input: ProdutoEntrada): ResultadoIbsCbs {
  const alertas: Alerta[] = [];

  if (input.anexoLc214 === "sim") {
    alertas.push({
      campo: "Anexo LC 214/2025",
      mensagem:
        "Produto sinalizado com possível enquadramento em anexo específico da LC nº 214/2025 (alíquota reduzida, isenção, diferimento, monofasia etc.). O motor aplicou por padrão a tributação integral (CST 000 / cClassTrib 000001) — confirme o NCM contra os Anexos da lei e a tabela vigente do Informe Técnico NF-e 2025.002 antes de emitir o documento fiscal.",
      norma: NORMA_LC214,
    });
  } else if (input.anexoLc214 === "verificar") {
    alertas.push({
      campo: "Anexo LC 214/2025",
      mensagem:
        "Enquadramento em anexo da LC nº 214/2025 não confirmado. Confirme o NCM contra os Anexos da lei antes de emitir o documento fiscal.",
      norma: NORMA_LC214,
    });
  }

  return { cst: CST_IBS_CBS["000"], cClassTrib: CCLASSTRIB_PADRAO, alertas };
}

function resolverAlertasDestinatario(input: ProdutoEntrada): Alerta[] {
  if (input.tipoOperacao !== "venda") return [];
  const alertas: Alerta[] = [];
  if (input.destino === "interestadual" && input.destinatario === "consumidor_final") {
    alertas.push({
      campo: "Destinatário",
      mensagem:
        "Venda interestadual a consumidor final: verifique o DIFAL e a partilha do ICMS entre a Bahia e o estado de destino.",
      norma: "EC nº 87/2015; Convênio ICMS nº 236/2021",
    });
  }
  if (input.destinatario === "orgao_publico") {
    alertas.push({
      campo: "Destinatário",
      mensagem:
        "Venda para órgão público: verifique eventual retenção de tributos na fonte (ICMS/PIS/COFINS/IR/CSLL) conforme a legislação do ente contratante.",
      norma: "Legislação do ente público contratante",
    });
  }
  return alertas;
}

export function classificarProduto(input: ProdutoEntrada): ProdutoResultado {
  const alertas: Alerta[] = [];

  const { cfop, alertas: alertasCfop } = resolverCfop(input);
  const { cst: cstPisBase, alertas: alertasPis } = resolverCstPisCofins(input);
  const { cst: cstIbsCbsBase, cClassTrib: cClassTribBase, alertas: alertasIbs } = resolverIbsCbs(input);
  alertas.push(...alertasCfop, ...alertasPis, ...alertasIbs, ...resolverAlertasDestinatario(input));

  let cstPis = cstPisBase;
  let cstCofins = cstPisBase;
  let cstIbsCbs = cstIbsCbsBase;
  let cClassTrib = cClassTribBase;

  const excecao = ncmExcecoes[input.ncm];
  if (excecao) {
    if (excecao.cstPis) cstPis = CST_PIS_COFINS[excecao.cstPis] ?? cstPis;
    if (excecao.cstCofins) cstCofins = CST_PIS_COFINS[excecao.cstCofins] ?? cstCofins;
    if (excecao.cstIbsCbs) cstIbsCbs = CST_IBS_CBS[excecao.cstIbsCbs] ?? cstIbsCbs;
    if (excecao.cClassTrib) cClassTrib = excecao.cClassTrib;
    alertas.push({
      campo: "Exceção por NCM",
      mensagem: `Regra específica aplicada para o NCM ${input.ncm}: ${excecao.observacao}`,
      norma: excecao.norma,
    });
  }

  return {
    codigo: input.codigo,
    descricao: input.descricao,
    ncm: input.ncm,
    cfop,
    cstPis,
    cstCofins,
    cstIbsCbs,
    cClassTrib,
    alertas,
    linha: input.linha,
  };
}

export function classificarProdutos(inputs: ProdutoEntrada[]): ProdutoResultado[] {
  return inputs.map(classificarProduto);
}
