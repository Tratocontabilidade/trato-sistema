// Motor de classificação fiscal — layout fixo "Cadastro de Produtos".
//
// Este módulo não depende da interface (app/). Recebe linhas já lidas da
// planilha do cliente (ver lib/excel.ts) e devolve, para cada uma, os campos
// de classificação preenchidos ou validados, com Status e Observação.
//
// Princípio geral: se a linha já veio classificada pelo cliente, o motor
// NUNCA sobrescreve — só valida (formato do código e coerência com o padrão
// esperado). Se estiver em branco, preenche com base no Padrão A/B (conforme
// a coluna Tributação) e nas sobrescritas por NCM em lib/tables.ts. Linhas
// "Não tributado"/"Isento" nunca são preenchidas automaticamente.

import {
  PADRAO_TRIBUTADO,
  PADRAO_ST,
  buscarOverridePorNcm,
} from "./tables";
import type { ClientProdutoEntrada, ClientProdutoResultado, StatusLinha } from "./types";

type Categoria = "tributado" | "st" | "isento_nao_tributado" | "desconhecido";

interface Pendencia {
  peso: number;
  mensagem: string;
}

function normalizarChaveTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function categorizarTributacao(valor: string): Categoria {
  const chave = normalizarChaveTexto(valor ?? "");
  if (!chave) return "desconhecido";
  if (chave.includes("substitui")) return "st";
  if (chave.includes("isento") || chave.includes("nao tributado")) return "isento_nao_tributado";
  if (chave.includes("tributad")) return "tributado";
  return "desconhecido";
}

function estaPreenchido(valor: string | number | null | undefined): boolean {
  return valor !== null && valor !== undefined && String(valor).trim() !== "";
}

interface ResultadoCampoCodigo {
  valor: string;
  pendencia?: Pendencia;
  autopreenchido?: boolean;
}

function processarCampoCodigo(opts: {
  nomeCampo: string;
  bruto: string;
  digitosEsperados: number;
  esperado: string | undefined;
  bloquearAutofill: boolean;
  sempreAlertarDivergenciaDigitos?: boolean;
}): ResultadoCampoCodigo {
  const { nomeCampo, bruto, digitosEsperados, esperado, bloquearAutofill, sempreAlertarDivergenciaDigitos } = opts;

  if (!estaPreenchido(bruto)) {
    if (bloquearAutofill || esperado === undefined) return { valor: "" };
    return { valor: esperado, autopreenchido: true };
  }

  const soDigitos = String(bruto).replace(/\D/g, "");
  if (soDigitos.length === 0) {
    return {
      valor: String(bruto).trim(),
      pendencia: { peso: 2, mensagem: `${nomeCampo} "${bruto}" não é um código numérico válido.` },
    };
  }

  const excedeu = soDigitos.length > digitosEsperados;
  const digitosOk = soDigitos.length === digitosEsperados;
  const valorNormalizado = excedeu ? String(bruto).trim() : soDigitos.padStart(digitosEsperados, "0");

  if (excedeu || (sempreAlertarDivergenciaDigitos && !digitosOk)) {
    return {
      valor: valorNormalizado,
      pendencia: {
        peso: 2,
        mensagem: `${nomeCampo} "${bruto}" tem ${soDigitos.length} dígito(s) (esperado ${digitosEsperados}).`,
      },
    };
  }

  if (esperado !== undefined && !bloquearAutofill && valorNormalizado !== esperado) {
    return {
      valor: valorNormalizado,
      pendencia: {
        peso: 2,
        mensagem: `${nomeCampo} informado ("${valorNormalizado}") diverge do padrão esperado ("${esperado}").`,
      },
    };
  }

  return { valor: valorNormalizado };
}

interface ResultadoCampoNumero {
  valor: number | null;
  pendencia?: Pendencia;
  autopreenchido?: boolean;
}

function processarCampoNumero(opts: {
  nomeCampo: string;
  bruto: number | null;
  esperado: number | null | undefined;
  bloquearAutofill: boolean;
}): ResultadoCampoNumero {
  const { nomeCampo, bruto, esperado, bloquearAutofill } = opts;

  if (!estaPreenchido(bruto)) {
    if (bloquearAutofill || esperado === undefined || esperado === null) return { valor: null };
    return { valor: esperado, autopreenchido: true };
  }

  if (esperado !== undefined && esperado !== null && !bloquearAutofill && Math.abs((bruto as number) - esperado) > 0.001) {
    return {
      valor: bruto,
      pendencia: {
        peso: 2,
        mensagem: `${nomeCampo} informado (${bruto}) diverge do padrão esperado (${esperado}).`,
      },
    };
  }

  return { valor: bruto };
}

interface ResultadoCampoTexto {
  valor: string;
  pendencia?: Pendencia;
  autopreenchido?: boolean;
}

function processarCampoTextoLivre(opts: {
  nomeCampo: string;
  bruto: string;
  esperado: string | undefined;
  bloquearAutofill: boolean;
}): ResultadoCampoTexto {
  const { nomeCampo, bruto, esperado, bloquearAutofill } = opts;

  if (!estaPreenchido(bruto)) {
    if (bloquearAutofill || esperado === undefined || esperado === "") return { valor: "" };
    return { valor: esperado, autopreenchido: true };
  }

  if (esperado !== undefined && !bloquearAutofill && bruto.trim() !== esperado) {
    return {
      valor: bruto,
      pendencia: {
        peso: 2,
        mensagem: `${nomeCampo} informado ("${bruto}") diverge do padrão esperado ("${esperado}").`,
      },
    };
  }

  return { valor: bruto };
}

function pesoParaStatus(peso: number): StatusLinha {
  if (peso >= 3) return "Revisar manualmente";
  if (peso === 2) return "Divergência detectada";
  if (peso === 1) return "Preenchido automaticamente";
  return "OK";
}

export function classificarProdutoCliente(input: ClientProdutoEntrada): ClientProdutoResultado {
  const pendencias: Pendencia[] = [];
  let algumAutofill = false;

  const ncmDigitos = input.ncm;
  const ncmValido = ncmDigitos.length === 8;
  if (!ncmDigitos) {
    pendencias.push({ peso: 2, mensagem: "NCM não informado." });
  } else if (!ncmValido) {
    pendencias.push({
      peso: 2,
      mensagem: `NCM "${input.ncmOriginal}" tem ${ncmDigitos.length} dígito(s) (esperado 8) — sobrescritas por NCM podem não ter sido aplicadas.`,
    });
  }

  const categoria = categorizarTributacao(input.tributacao);
  if (categoria === "desconhecido") {
    pendencias.push({ peso: 3, mensagem: `Tributação "${input.tributacao || "(vazia)"}" não reconhecida.` });
  }
  const bloquearAutofill = categoria === "isento_nao_tributado";
  if (bloquearAutofill) {
    pendencias.push({
      peso: 3,
      mensagem: `Tributação "${input.tributacao}": CFOP/CST não são preenchidos automaticamente.`,
    });
  }

  const padraoBase = categoria === "st" ? PADRAO_ST : categoria === "tributado" ? PADRAO_TRIBUTADO : null;
  // Sobrescritas por NCM só se aplicam sobre um padrão de Tributação existente.
  const override = padraoBase && ncmValido ? buscarOverridePorNcm(ncmDigitos) : undefined;
  if (override) {
    pendencias.push({ peso: 0, mensagem: `Sobrescrita por NCM aplicada: ${override.observacao}` });
  }

  function campoCodigo(
    nomeCampo: string,
    bruto: string,
    digitos: number,
    esperado: string | undefined,
    sempreAlertarDivergenciaDigitos = false
  ): string {
    const r = processarCampoCodigo({
      nomeCampo,
      bruto,
      digitosEsperados: digitos,
      esperado,
      bloquearAutofill,
      sempreAlertarDivergenciaDigitos,
    });
    if (r.pendencia) pendencias.push(r.pendencia);
    if (r.autopreenchido) algumAutofill = true;
    return r.valor;
  }

  function campoNumero(nomeCampo: string, bruto: number | null, esperado: number | null | undefined): number | null {
    const r = processarCampoNumero({ nomeCampo, bruto, esperado, bloquearAutofill });
    if (r.pendencia) pendencias.push(r.pendencia);
    if (r.autopreenchido) algumAutofill = true;
    return r.valor;
  }

  function campoTexto(nomeCampo: string, bruto: string, esperado: string | undefined): string {
    const r = processarCampoTextoLivre({ nomeCampo, bruto, esperado, bloquearAutofill });
    if (r.pendencia) pendencias.push(r.pendencia);
    if (r.autopreenchido) algumAutofill = true;
    return r.valor;
  }

  const cfopSaidas = campoCodigo("CFOP SAIDAS", input.cfopSaidas, 4, padraoBase?.cfopSaidas);
  const cstIcms = campoCodigo("CST ICMS", input.cstIcms, 3, padraoBase?.cstIcms);
  const cstPisCofins = campoCodigo(
    "CST PIS/COFINS",
    input.cstPisCofins,
    2,
    override?.cstPisCofins ?? padraoBase?.cstPisCofins
  );
  const pis = campoNumero("PIS", input.pis, override?.pis ?? padraoBase?.pis);
  const cofins = campoNumero("COFINS", input.cofins, override?.cofins ?? padraoBase?.cofins);
  const natReceita = campoTexto("NAT. RECEITA", input.natReceita, override?.natReceita ?? padraoBase?.natReceita);
  const cstIbsCbs = campoCodigo("CST IBS/CBS", input.cstIbsCbs, 3, override?.cstIbsCbs ?? padraoBase?.cstIbsCbs);
  const cclasstrib = campoCodigo(
    "Cclasstrib",
    input.cclasstrib,
    6,
    override?.cclasstrib ?? padraoBase?.cclasstrib,
    true
  );
  const redBc = campoNumero("RED. B.C.", input.redBc, override?.redBc ?? padraoBase?.redBc);
  const ibs = campoNumero("IBS", input.ibs, padraoBase?.ibs);
  const cbs = campoNumero("CBS", input.cbs, padraoBase?.cbs);

  const pesoFinal = Math.max(0, ...pendencias.map((p) => p.peso), algumAutofill ? 1 : 0);
  const status = pesoParaStatus(pesoFinal);
  const observacao = status === "OK" ? "" : pendencias.map((p) => p.mensagem).join(" ");

  return {
    ...input,
    cfopSaidas,
    cstIcms,
    cstPisCofins,
    pis,
    cofins,
    natReceita,
    cstIbsCbs,
    cclasstrib,
    redBc,
    ibs,
    cbs,
    status,
    observacao,
  };
}

export interface ProgressoClassificacao {
  processados: number;
  total: number;
}

/**
 * Classifica em lotes, cedendo o controle ao event loop entre eles, para que
 * a interface possa repintar uma barra de progresso em planilhas grandes
 * (dezenas de milhares de linhas) sem travar.
 */
export async function classificarProdutosClienteAsync(
  entradas: ClientProdutoEntrada[],
  opts?: { tamanhoLote?: number; onProgresso?: (p: ProgressoClassificacao) => void }
): Promise<ClientProdutoResultado[]> {
  const tamanhoLote = opts?.tamanhoLote ?? 2000;
  const resultados: ClientProdutoResultado[] = new Array(entradas.length);

  for (let inicio = 0; inicio < entradas.length; inicio += tamanhoLote) {
    const fim = Math.min(inicio + tamanhoLote, entradas.length);
    for (let i = inicio; i < fim; i++) {
      resultados[i] = classificarProdutoCliente(entradas[i]);
    }
    opts?.onProgresso?.({ processados: fim, total: entradas.length });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return resultados;
}
