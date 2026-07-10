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
  ALIQUOTA_FCP_COSMETICOS_BA,
  PADRAO_TRIBUTADO,
  PADRAO_TRIBUTADO_CUMULATIVO,
  PADRAO_ST,
  PADRAO_ST_CUMULATIVO,
  avaliarBeneficioIcmsBa,
  avaliarFcpCosmeticos,
  buscarOverridePorNcm,
  inferirNcmPorNome,
  type AvaliacaoFcpCosmeticos,
} from "./tables";
import { resolverRegimeFederal } from "./regras-federais";
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

interface ResultadoCampoFcp {
  valor: string | number;
  pendencia?: Pendencia;
  autopreenchido?: boolean;
}

/**
 * FCP 2% de cosméticos (Bahia, IN SAT nº 005/2016). `avaliacao` vem de
 * `avaliarFcpCosmeticos` (lib/tables.ts) — `null` quando o NCM nem consta na
 * lista, caso em que a coluna é só repassada (comportamento anterior).
 */
function processarAliqFcp(
  bruto: string | number,
  avaliacao: AvaliacaoFcpCosmeticos | null,
  bloquearAutofill: boolean
): ResultadoCampoFcp {
  if (!avaliacao || bloquearAutofill) return { valor: bruto };

  const brutoTexto = String(bruto ?? "").trim();
  const brutoNumero = brutoTexto === "" ? null : Number(brutoTexto.replace("%", "").replace(",", "."));
  const brutoPreenchido = brutoTexto !== "" && brutoNumero !== null && Number.isFinite(brutoNumero);

  if (avaliacao.aplicaFcp) {
    if (!brutoPreenchido) {
      return {
        valor: ALIQUOTA_FCP_COSMETICOS_BA,
        autopreenchido: true,
        pendencia: {
          peso: 0,
          mensagem: `ALIQ. FCP preenchida em ${ALIQUOTA_FCP_COSMETICOS_BA}% — ${avaliacao.descricao} (IN SAT nº 005/2016).`,
        },
      };
    }
    if (Math.abs((brutoNumero as number) - ALIQUOTA_FCP_COSMETICOS_BA) > 0.001) {
      return {
        valor: bruto,
        pendencia: {
          peso: 2,
          mensagem: `ALIQ. FCP informada ("${brutoTexto}") diverge do esperado (${ALIQUOTA_FCP_COSMETICOS_BA}%) para este NCM (IN SAT nº 005/2016).`,
        },
      };
    }
    return { valor: bruto };
  }

  // Exceção da IN 005/2016 — não deve levar FCP 2%.
  if (brutoPreenchido && brutoNumero !== 0) {
    return {
      valor: bruto,
      pendencia: {
        peso: 2,
        mensagem: `ALIQ. FCP informada ("${brutoTexto}") diverge do esperado: produto sinalizado como exceção do FCP 2% pelo nome (${avaliacao.excecao}) — IN SAT nº 005/2016.`,
      },
    };
  }
  if (!brutoPreenchido) {
    return {
      valor: bruto,
      pendencia: {
        peso: 1,
        mensagem: `Produto sinalizado como exceção do FCP 2% pelo nome (${avaliacao.excecao}) — IN SAT nº 005/2016.`,
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

  let ncmDigitos = input.ncm;
  let ncmOriginalEfetivo = input.ncmOriginal;
  let ncmInferidoDescricao: string | undefined;

  // Regra de ouro: sem NCM não dá para saber se um produto é ST, se cai numa
  // sobrescrita/redução, ou se consta em algum anexo — nenhum desses campos
  // pode ser "chutado" a partir só da coluna Tributação. Antes de desistir,
  // tenta inferir o NCM por palavra-chave no Nome (lib/tables.ts); se achar,
  // segue a classificação normal mas SEMPRE marcada como inferência — nunca
  // sai como "OK" nem como "Preenchido automaticamente" comum, para o NCM
  // inferido nunca ser confundido com um NCM real. Se não achar nada, Dúvida.
  if (!ncmDigitos) {
    const inferencia = inferirNcmPorNome(nomeNormalizado);
    if (!inferencia) {
      return construirResultadoDuvida(input, "NCM não informado — não é possível determinar CFOP/CST/ST sem o NCM.");
    }
    ncmDigitos = inferencia.ncm;
    ncmOriginalEfetivo = inferencia.ncm;
    ncmInferidoDescricao = inferencia.descricao;
  }

  const ncmValido = ncmDigitos.length === 8;
  const pendencias: Pendencia[] = [];
  let algumAutofill = false;

  if (!ncmValido) {
    pendencias.push({
      peso: 2,
      mensagem: `NCM "${input.ncmOriginal}" tem ${ncmDigitos.length} dígito(s) (esperado 8) — classificado por casamento de prefixo; confirme o NCM completo.`,
    });
  }

  // NCM sabidamente ambíguo (lib/tables.ts): nunca classificar automaticamente.
  // Usa casamento por prefixo (não exige os 8 dígitos exatos) para pegar também
  // NCMs sujos/curtos que ainda assim caem num prefixo ambíguo conhecido.
  const possivelAmbiguo = buscarOverridePorNcm(ncmDigitos);
  if (possivelAmbiguo?.ambiguo) {
    return construirResultadoDuvida(input, possivelAmbiguo.observacao);
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

  // Anexos ativos da empresa (Bloco 3) são a ÚNICA fonte de verdade para ST quando
  // existem: com pelo menos um anexo ativo, um NCM só é tratado como ST se constar
  // nele — nunca por causa de um valor legado na coluna Tributação, e nunca por uma
  // entrada de NCM_OVERRIDES (que não tem campos de CFOP/CST ICMS — ver lib/tables.ts).
  // Isso vale mesmo que uma regra tenha existido no passado e tenha sido revogada
  // (ex.: item 9-A do Anexo 1 do RICMS-BA revogado em 2026 para cosméticos): o anexo
  // vigente decide, não uma suposição interna do sistema.
  // Casamento por prefixo (não exige os 8 dígitos exatos): um NCM sujo/curto
  // (ex.: "1806900", 7 dígitos, faltando o zero final) ainda deve ser
  // conferido contra o anexo — descartar essa checagem só porque o NCM não
  // tem exatamente 8 dígitos é o que permitia a coluna Tributação (que pode
  // trazer um valor desatualizado) decidir ST sozinha, sem confirmação.
  const anexosAtivos = (contexto.anexosAtivos ?? []).filter((a) => a.ativo);
  const ncmNoAnexo = anexosAtivos.length > 0 ? buscarNoAnexo(ncmDigitos, anexosAtivos) : null;
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
  // Casamento por prefixo — não exige os 8 dígitos exatos, pela mesma razão do anexo acima.
  const override = padraoBase ? buscarOverridePorNcm(ncmDigitos) : undefined;
  if (override) {
    pendencias.push({ peso: 0, mensagem: `Sobrescrita por NCM aplicada: ${override.observacao}` });
  }

  // FCP 2% de cosméticos (Bahia, IN SAT nº 005/2016) — só avaliado para produtos que
  // já serão tributados (Padrão A/B); nunca aplica a isento/não tributado/desconhecido.
  // avaliarFcpCosmeticos já exige NCM de 8 dígitos exatos internamente (as faixas da IN
  // SAT nº 005/2016 são sensíveis ao NCM completo) — aqui não é preciso repetir o gate.
  const avaliacaoFcp = padraoBase ? avaliarFcpCosmeticos(ncmDigitos, String(input.nome ?? "")) : null;
  if (avaliacaoFcp?.ambiguo) {
    return construirResultadoDuvida(input, avaliacaoFcp.motivoAmbiguo!);
  }

  // Regime federal de PIS/COFINS (lib/regras-federais.ts) — monofásico, alíquota
  // zero ou ST federal por NCM+Nome. Tem prioridade sobre o Padrão A/B (CST 01)
  // para CST PIS/COFINS, PIS, COFINS e NAT. RECEITA, mas nunca sobre uma regra
  // aprendida da empresa. Só avaliado para produtos que já serão tributados.
  const resultadoFederal = padraoBase ? resolverRegimeFederal(ncmDigitos, nomeNormalizado) : { tipo: "nenhuma" as const };
  if (resultadoFederal.tipo === "ambiguo") {
    return construirResultadoDuvida(input, resultadoFederal.motivo);
  }
  const regraFederal = resultadoFederal.tipo === "regra" ? resultadoFederal.regra : undefined;
  if (regraFederal) {
    pendencias.push({
      peso: 0,
      mensagem: `PIS/COFINS: ${regraFederal.regime} — ${regraFederal.baseLegal}`,
    });
  }

  // Benefícios fiscais de ICMS-BA (lib/tables.ts, avaliarBeneficioIcmsBa) — isenção
  // (Art. 265 RICMS-BA), redução de base de cálculo (Art. 268 RICMS-BA) e alíquota
  // reduzida (Art. 16 Lei 7.014/96), só para operações internas na Bahia (CFOP 5xxx).
  // Só avaliado quando o produto é tributado normalmente — nunca ST: o anexo ativo da
  // empresa (ou a coluna Tributação, na ausência de anexo) sempre decide ST primeiro,
  // por cima de qualquer benefício fiscal.
  const beneficioIcmsBa = categoria === "tributado" ? avaliarBeneficioIcmsBa(ncmDigitos, nomeNormalizado) : null;
  if (beneficioIcmsBa?.ambiguo) {
    return construirResultadoDuvida(input, beneficioIcmsBa.motivoAmbiguo!);
  }
  if (beneficioIcmsBa?.observacao) {
    pendencias.push({ peso: 0, mensagem: beneficioIcmsBa.observacao });
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
  //
  // REGRA ABSOLUTA: cfopSaidas e cstIcms (os campos que decidem ST) NUNCA são
  // aceitos como regra aprendida, mesmo que existam no cadastro da empresa —
  // a única autoridade para ST é o anexo ativo (ou, na ausência de anexo, a
  // coluna Tributação da planilha, com a validação cruzada normal). Sem essa
  // trava, uma correção aprovada por engano no fluxo de aprendizado (ex.:
  // "Aprovar todas do mesmo NCM" clicado no NCM errado) travaria esse NCM em
  // ST (ou não-ST) para sempre, por fora do anexo vigente — exatamente o tipo
  // de erro silencioso que a regra de ouro existe para evitar.
  const CAMPOS_QUE_NUNCA_VEM_DE_REGRA_APRENDIDA = new Set(["cfopSaidas", "cstIcms"]);
  const regrasNcm = ncmValido ? (contexto.regrasAprendidas ?? []).filter((r) => r.ncm === ncmDigitos) : [];
  function regraAprendida(campo: string): string | undefined {
    if (CAMPOS_QUE_NUNCA_VEM_DE_REGRA_APRENDIDA.has(campo)) return undefined;
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

  function campoFcp(bruto: string | number): string | number {
    const r = processarAliqFcp(bruto, avaliacaoFcp, bloquearAutofill);
    if (r.pendencia) pendencias.push(r.pendencia);
    if (r.autopreenchido) algumAutofill = true;
    return r.valor;
  }

  // cfopSaidas/cstIcms nunca consultam regraAprendida (ver comentário acima) — vêm só do
  // padrão derivado da categoria já corrigida pelo anexo (ou pela Tributação, na ausência dele),
  // com os benefícios fiscais de ICMS-BA (isenção/redução) tendo prioridade sobre o CST 000 padrão.
  const cfopSaidas = campoCodigo("CFOP SAIDAS", input.cfopSaidas, 4, padraoBase?.cfopSaidas);
  const cstIcms = campoCodigo("CST ICMS", input.cstIcms, 3, beneficioIcmsBa?.cstIcms ?? padraoBase?.cstIcms);
  const cstPisCofins = campoCodigo(
    "CST PIS/COFINS",
    input.cstPisCofins,
    2,
    regraAprendida("cstPisCofins") ?? regraFederal?.cstPisCofins ?? padraoBase?.cstPisCofins
  );
  const pis = campoNumero("PIS", input.pis, regraAprendidaNumero("pis") ?? regraFederal?.pis ?? padraoBase?.pis);
  const cofins = campoNumero(
    "COFINS",
    input.cofins,
    regraAprendidaNumero("cofins") ?? regraFederal?.cofins ?? padraoBase?.cofins
  );
  const natReceita = campoTexto(
    "NAT. RECEITA",
    input.natReceita,
    regraAprendida("natReceita") ?? regraFederal?.natReceita ?? padraoBase?.natReceita
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
  const aliqFcp = campoFcp(input.aliqFcp);

  const pesoFinal = Math.max(0, ...pendencias.map((p) => p.peso), algumAutofill ? 1 : 0);
  // NCM inferido nunca sai como "OK" nem como "Preenchido automaticamente" comum — o status
  // dedicado deixa claro, em qualquer tela ou planilha baixada, que o NCM não veio do cliente.
  const status: StatusLinha = ncmInferidoDescricao
    ? "Preenchido com inferência de NCM — revisar"
    : pesoParaStatus(pesoFinal);
  const mensagensPendencias = pendencias.map((p) => p.mensagem).join(" ");
  const observacao = ncmInferidoDescricao
    ? `NCM inferido do nome (${ncmInferidoDescricao}) — validar antes de emitir NF-e. ${mensagensPendencias}`.trim()
    : status === "OK"
      ? ""
      : mensagensPendencias;

  return {
    ...input,
    ncm: ncmDigitos,
    ncmOriginal: ncmOriginalEfetivo,
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
    aliqFcp,
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
