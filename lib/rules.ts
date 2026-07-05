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
//
// Regra de ouro: qualquer ambiguidade (segmento excluído por instrução,
// NCM marcado como ambíguo em lib/tables.ts, Tributação não reconhecida
// combinada a instrução também não reconhecida) nunca é "chutada" — a
// linha volta com os campos de classificação em branco e Status "Dúvida —
// aguardando instrução", citando o motivo.

import {
  PADRAO_TRIBUTADO,
  PADRAO_TRIBUTADO_CUMULATIVO,
  PADRAO_ST,
  PADRAO_ST_CUMULATIVO,
  buscarOverridePorNcm,
} from "./tables";
import { produtoPertenceAoSegmento, type Diretiva } from "./instructions";
import { buscarNoAnexo } from "./anexos";
import type { ClientProdutoEntrada, ClientProdutoResultado, ContextoClassificacao, StatusLinha } from "./types";

const CONTEXTO_PADRAO: ContextoClassificacao = { regime: "nao_cumulativo", diretivas: [] };

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

/**
 * Constrói o resultado "dúvida": nenhum campo de classificação é
 * preenchido, e a Observação explica exatamente o que impediu a
 * classificação automática. Usado sempre que a regra de ouro se aplica
 * (segmento excluído por instrução, NCM ambíguo em lib/tables.ts etc).
 */
function construirResultadoDuvida(input: ClientProdutoEntrada, motivo: string): ClientProdutoResultado {
  return {
    ...input,
    cfopSaidas: "",
    cstIcms: "",
    cstPisCofins: "",
    pis: null,
    cofins: null,
    natReceita: "",
    cstIbsCbs: "",
    cclasstrib: "",
    redBc: null,
    ibs: null,
    cbs: null,
    status: "Dúvida — aguardando instrução",
    observacao: motivo,
  };
}

export function classificarProdutoCliente(
  input: ClientProdutoEntrada,
  contexto: ContextoClassificacao = CONTEXTO_PADRAO
): ClientProdutoResultado {
  const nomeNormalizado = normalizarChaveTexto(String(input.nome ?? ""));

  const diretivaExcluir = contexto.diretivas.find(
    (d): d is Extract<Diretiva, { tipo: "excluir_segmento" }> =>
      d.tipo === "excluir_segmento" && produtoPertenceAoSegmento(nomeNormalizado, d.chave)
  );
  if (diretivaExcluir) {
    return construirResultadoDuvida(
      input,
      `Instrução do processamento: empresa não trabalha com ${diretivaExcluir.rotulo} — produto identificado nesse segmento pelo Nome.`
    );
  }

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

  // NCM sabidamente ambíguo (lib/tables.ts): nunca classificar automaticamente.
  if (ncmValido) {
    const possivelAmbiguo = buscarOverridePorNcm(ncmDigitos);
    if (possivelAmbiguo?.ambiguo) {
      return construirResultadoDuvida(input, possivelAmbiguo.observacao);
    }
  }

  const diretivaPadrao = contexto.diretivas.find(
    (d): d is Extract<Diretiva, { tipo: "forcar_padrao" }> => d.tipo === "forcar_padrao"
  );
  let categoria = categorizarTributacao(input.tributacao);
  if (diretivaPadrao) {
    categoria = diretivaPadrao.padrao === "isento" ? "isento_nao_tributado" : diretivaPadrao.padrao;
    pendencias.push({
      peso: 0,
      mensagem: `Padrão forçado pela instrução do processamento: "todos os produtos são ${diretivaPadrao.padrao}".`,
    });
  } else if (categoria === "desconhecido") {
    pendencias.push({ peso: 3, mensagem: `Tributação "${input.tributacao || "(vazia)"}" não reconhecida.` });
  }
  const bloquearAutofill = categoria === "isento_nao_tributado";
  if (bloquearAutofill) {
    pendencias.push({
      peso: 3,
      mensagem: `Tributação "${input.tributacao}": CFOP/CST não são preenchidos automaticamente.`,
    });
  }

  // Anexos ativos da empresa (Bloco 3) decidem ST por NCM, com prioridade sobre a coluna
  // Tributação — mas só quando o produto já é tributável (não se aplica a isento/desconhecido).
  const anexosAtivos = (contexto.anexosAtivos ?? []).filter((a) => a.ativo);
  const ncmNoAnexo = anexosAtivos.length > 0 && ncmValido ? buscarNoAnexo(ncmDigitos, anexosAtivos) : null;
  if (ncmNoAnexo !== null && (categoria === "tributado" || categoria === "st")) {
    if (ncmNoAnexo && categoria !== "st") {
      pendencias.push({ peso: 0, mensagem: "ST determinada pelo anexo ativo da empresa (NCM encontrado)." });
      categoria = "st";
    } else if (!ncmNoAnexo && categoria === "st") {
      pendencias.push({
        peso: 0,
        mensagem: "NCM não consta em nenhum anexo ativo da empresa — tratado como tributado normal (sem ST).",
      });
      categoria = "tributado";
    }
  }

  // Validação cruzada: CFOP já preenchido pelo cliente indicando ST/normal em desacordo com o anexo.
  if (ncmNoAnexo !== null && estaPreenchido(input.cfopSaidas)) {
    const cfopDigitos = String(input.cfopSaidas).replace(/\D/g, "");
    if (cfopDigitos === "5405" && !ncmNoAnexo) {
      pendencias.push({
        peso: 2,
        mensagem: "CFOP informado indica Substituição Tributária (5405), mas o NCM não consta em nenhum anexo ativo da empresa.",
      });
    } else if (cfopDigitos === "5102" && ncmNoAnexo) {
      pendencias.push({
        peso: 2,
        mensagem: "CFOP informado indica tributação normal (5102), mas o NCM consta em anexo ativo da empresa como ST.",
      });
    }
  }

  const cumulativo = contexto.regime === "cumulativo";
  const padraoBase =
    categoria === "st"
      ? cumulativo
        ? PADRAO_ST_CUMULATIVO
        : PADRAO_ST
      : categoria === "tributado"
        ? cumulativo
          ? PADRAO_TRIBUTADO_CUMULATIVO
          : PADRAO_TRIBUTADO
        : null;
  // Sobrescritas por NCM só se aplicam sobre um padrão de Tributação existente.
  const override = padraoBase && ncmValido ? buscarOverridePorNcm(ncmDigitos) : undefined;
  if (override) {
    pendencias.push({ peso: 0, mensagem: `Sobrescrita por NCM aplicada: ${override.observacao}` });
  }

  const diretivaReducao = contexto.diretivas.find(
    (d): d is Extract<Diretiva, { tipo: "reducao_segmento" }> =>
      d.tipo === "reducao_segmento" && produtoPertenceAoSegmento(nomeNormalizado, d.chave)
  );
  if (diretivaReducao) {
    pendencias.push({
      peso: 0,
      mensagem: `Redução de ${diretivaReducao.percentual}% aplicada pela instrução do processamento (segmento ${diretivaReducao.rotulo}).`,
    });
  }

  // Regras aprendidas da empresa (Bloco 5): maior prioridade de todas, por NCM+campo exato.
  // Só entram em produção depois de aprovação humana explícita (ver RevisaoAprendizado.tsx).
  const regrasNcm = ncmValido ? (contexto.regrasAprendidas ?? []).filter((r) => r.ncm === ncmDigitos) : [];
  function regraAprendida(campo: string): string | undefined {
    const regra = regrasNcm.find((r) => r.campo === campo);
    if (regra) {
      pendencias.push({
        peso: 0,
        mensagem: `Regra aprendida aplicada para ${campo} (${regra.origem}).`,
      });
    }
    return regra?.valorNovo;
  }
  function regraAprendidaNumero(campo: string): number | undefined {
    const v = regraAprendida(campo);
    return v === undefined ? undefined : Number(v);
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

  const cfopSaidas = campoCodigo("CFOP SAIDAS", input.cfopSaidas, 4, regraAprendida("cfopSaidas") ?? padraoBase?.cfopSaidas);
  const cstIcms = campoCodigo("CST ICMS", input.cstIcms, 3, regraAprendida("cstIcms") ?? padraoBase?.cstIcms);
  const cstPisCofins = campoCodigo(
    "CST PIS/COFINS",
    input.cstPisCofins,
    2,
    regraAprendida("cstPisCofins") ?? override?.cstPisCofins ?? padraoBase?.cstPisCofins
  );
  const pis = campoNumero("PIS", input.pis, regraAprendidaNumero("pis") ?? override?.pis ?? padraoBase?.pis);
  const cofins = campoNumero(
    "COFINS",
    input.cofins,
    regraAprendidaNumero("cofins") ?? override?.cofins ?? padraoBase?.cofins
  );
  const natReceita = campoTexto(
    "NAT. RECEITA",
    input.natReceita,
    regraAprendida("natReceita") ?? override?.natReceita ?? padraoBase?.natReceita
  );
  const cstIbsCbs = campoCodigo(
    "CST IBS/CBS",
    input.cstIbsCbs,
    3,
    regraAprendida("cstIbsCbs") ?? override?.cstIbsCbs ?? padraoBase?.cstIbsCbs
  );
  const cclasstrib = campoCodigo(
    "Cclasstrib",
    input.cclasstrib,
    6,
    regraAprendida("cclasstrib") ?? override?.cclasstrib ?? padraoBase?.cclasstrib,
    true
  );
  const redBc = campoNumero(
    "RED. B.C.",
    input.redBc,
    regraAprendidaNumero("redBc") ?? diretivaReducao?.percentual ?? override?.redBc ?? padraoBase?.redBc
  );
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
  opts?: {
    tamanhoLote?: number;
    contexto?: ContextoClassificacao;
    onProgresso?: (p: ProgressoClassificacao) => void;
  }
): Promise<ClientProdutoResultado[]> {
  const tamanhoLote = opts?.tamanhoLote ?? 2000;
  const contexto = opts?.contexto ?? CONTEXTO_PADRAO;
  const resultados: ClientProdutoResultado[] = new Array(entradas.length);

  for (let inicio = 0; inicio < entradas.length; inicio += tamanhoLote) {
    const fim = Math.min(inicio + tamanhoLote, entradas.length);
    for (let i = inicio; i < fim; i++) {
      resultados[i] = classificarProdutoCliente(entradas[i], contexto);
    }
    opts?.onProgresso?.({ processados: fim, total: entradas.length });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return resultados;
}
