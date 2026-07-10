// Regras de regime federal de PIS/COFINS por NCM — separado de
// NCM_OVERRIDES (lib/tables.ts), que trata só de IBS/CBS (LC nº
// 214/2025). São obrigações federais distintas, com bases legais e
// listas de NCM próprias (nem sempre coincidentes com a "cesta básica"
// do IBS/CBS), por isso vivem em tabelas separadas.
//
// Tem prioridade sobre o Padrão A/B (CST 01, tributado normal, PIS
// 1,65%/COFINS 7,6% ou 0,65%/3% no regime cumulativo) para os campos que
// define — mas nunca sobre uma regra aprendida da empresa (a prioridade
// completa é resolvida em lib/rules.ts).
//
// Casamento por prefixo de NCM, igual a NCM_OVERRIDES: entradas mais
// específicas vêm antes das mais genéricas — a primeira que combinar
// vence (por isso, por exemplo, "340119" e "481810" aparecem antes dos
// catch-alls "3401"/"4818" do mesmo capítulo, mesmo estando em regimes
// diferentes). Quando o NCM sozinho não decide (ex.: capítulo 9603 cobre
// tanto escovas dentais quanto de cabelo), o Nome do produto desempata
// por palavra-chave; se nem assim der para decidir com confiança, a
// linha vira Dúvida — regra de ouro, nunca chuta o regime federal.
//
// TODA entrada tem a base legal citada no comentário e no campo
// `baseLegal`, para poder ser defendida em fiscalização.

export interface RegraFederalAplicada {
  cstPisCofins: string;
  pis: number;
  cofins: number;
  natReceita?: string;
  /** Rótulo curto do regime, usado na Observação da linha (ex.: "Monofásico"). */
  regime: string;
  /** Base legal citada na Observação. */
  baseLegal: string;
}

interface EntradaFixa {
  tipo: "fixa";
  prefixos: string[];
  regra: RegraFederalAplicada;
}

interface EntradaPorNome {
  tipo: "por_nome";
  /** Prefixos "genéricos" que por si só não decidem — o Nome desempata. */
  prefixos: string[];
  /** Se o Nome contiver alguma destas palavras, aplica `regra`. */
  palavrasChaveAplicar: string[];
  regra: RegraFederalAplicada;
  /** Se o Nome contiver alguma destas palavras, NÃO aplica regra nenhuma (segue o Padrão A normalmente). */
  palavrasChaveNaoAplicar: string[];
  motivoAmbiguo: string;
}

interface EntradaAmbigua {
  tipo: "ambigua";
  prefixos: string[];
  motivo: string;
}

type EntradaFederal = EntradaFixa | EntradaPorNome | EntradaAmbigua;

const REGIME_MONOFASICO = "Monofásico (CST 04, alíquota zero na revenda)";
const REGIME_ALIQUOTA_ZERO = "Alíquota zero (CST 06)";
const REGIME_ST_FEDERAL = "Substituição tributária federal de PIS/COFINS (CST 05)";

const REGRAS_FEDERAIS_PIS_COFINS: EntradaFederal[] = [
  // ---------------------------------------------------------------------
  // Sabão em barra (3401.19) e papel higiênico folha simples (4818.10) são
  // alíquota zero — as entradas específicas vêm ANTES dos catch-alls
  // monofásicos/ambíguos do mesmo capítulo (3401/4818), para não perder a
  // especificidade do subitem.
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["340119"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — sabão em barra para lavar roupa (NCM 3401.19).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["481810"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º, XII — papel higiênico folha simples (NCM 4818.10).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["481820", "481840"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.147/2000 — lenços de papel (NCM 4818.20) e fraldas/absorventes (NCM 4818.40).",
    },
  },
  {
    tipo: "ambigua",
    prefixos: ["4818"],
    motivo:
      "NCM 4818xxxx pode ser alíquota zero (papel higiênico, NCM 4818.10) ou monofásico (lenços de papel/" +
      "fraldas/absorventes, NCM 4818.20/4818.40) — confirme o subitem completo (8 dígitos) antes de classificar.",
  },

  // ---------------------------------------------------------------------
  // Escovas (capítulo 9603) — só a dental é monofásica; de cabelo, roupa
  // ou limpeza é tributada normalmente (CST 01, Padrão A). O NCM completo
  // (8 dígitos) já desambigua na maioria dos casos; o Nome só entra quando
  // o NCM vier truncado no capítulo genérico "9603".
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["96032100"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.147/2000 — escovas dentais (NCM 9603.21).",
    },
  },
  {
    tipo: "por_nome",
    prefixos: ["9603"],
    palavrasChaveAplicar: ["dental", "dente", "oral"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.147/2000 — escovas dentais (NCM 9603.21).",
    },
    // 9603.29 (escovas de cabelo, roupa, limpeza etc.) NÃO é monofásica — cai no
    // Padrão A (CST 01) normalmente; a palavra-chave existe só para reforçar isso
    // quando o NCM do cliente vier truncado em "9603" sem o subitem.
    palavrasChaveNaoAplicar: ["cabelo", "roupa", "limpeza"],
    motivoAmbiguo:
      "NCM do capítulo 9603 (escovas) veio sem o subitem completo, e o Nome não indica claramente se é " +
      "escova dental (monofásica) ou de cabelo/roupa/limpeza (tributada normal) — confirme o NCM de 8 dígitos.",
  },

  // ---------------------------------------------------------------------
  // Cosméticos, perfumaria e higiene pessoal — monofásico (Lei nº 10.147/2000).
  // (340119, sabão em barra, já tratado acima com alíquota zero — o restante
  // do capítulo 3401, sabonetes, é monofásico.)
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["3303", "3304", "3305", "3306", "3307"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.147/2000 — perfumaria, cosméticos e produtos de higiene pessoal (capítulo 33).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["3401"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.147/2000 — sabonetes (NCM 3401, exceto 3401.19 — sabão em barra, alíquota zero).",
    },
  },

  // ---------------------------------------------------------------------
  // Bebidas frias — monofásico (Lei nº 10.833/2003, art. 58).
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["2201", "2202", "2203"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal:
        "Lei nº 10.833/2003, art. 58 — bebidas frias (águas, refrigerantes, isotônicos, energéticos, cerveja).",
    },
  },

  // ---------------------------------------------------------------------
  // Autopeças — monofásico (Lei nº 10.485/2002).
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["4011", "4013", "8708", "9026", "9029", "9031", "9032"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 10.485/2002 — autopeças (pneus, câmaras de ar, peças e componentes de veículos).",
    },
  },

  // ---------------------------------------------------------------------
  // Combustíveis — regime monofásico (Lei nº 9.718/1998, com alterações
  // da Lei nº 9.990/2000 e Lei nº 10.560/2002).
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["2710", "2711"],
    regra: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      regime: REGIME_MONOFASICO,
      baseLegal: "Lei nº 9.718/1998 — regime monofásico de combustíveis (derivados de petróleo, GLP, gás natural).",
    },
  },

  // ---------------------------------------------------------------------
  // Cesta básica federal — alíquota zero (Lei nº 10.925/2004, art. 1º).
  // Lista própria do PIS/COFINS federal — não é idêntica à cesta básica do
  // IBS/CBS em NCM_OVERRIDES (bases legais diferentes: LC nº 214/2025 x
  // Lei nº 10.925/2004), por isso vive nesta tabela separada.
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["0713", "1006", "1101", "1102", "110620", "190120", "190590"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal:
        "Lei nº 10.925/2004, art. 1º — feijão/leguminosas, arroz, farinha de trigo, farinha de mandioca " +
        "(NCM 1106.20) e pão comum.",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["0401", "0402", "0406"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — leite fluido, leite em pó e queijos (NCM 0406).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["0407"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — ovos.",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["0201", "0202", "0203", "0207"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — carnes bovina, suína e de aves, frescas ou refrigeradas.",
    },
  },
  {
    // "Algumas" (não todas) as carnes salgadas/em salmoura/secas/defumadas de 0210
    // têm alíquota zero pela Lei nº 10.925/2004 — o subitem exato decide, e o
    // sistema não tem como saber qual sem o NCM completo. Nunca presumir.
    tipo: "ambigua",
    prefixos: ["0210"],
    motivo:
      "NCM 0210 (carnes e miudezas salgadas, em salmoura, secas ou defumadas) só tem alíquota zero de " +
      "PIS/COFINS em alguns subitens da Lei nº 10.925/2004, não no capítulo inteiro — confirme o subitem " +
      "exato (8 dígitos) antes de classificar.",
  },
  {
    tipo: "fixa",
    prefixos: ["0302", "0303", "0304"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — peixes frescos, refrigerados ou congelados.",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["1507", "1515"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — óleo de soja e óleo de milho (NCM 1515.29).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["0405"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — manteiga.",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["170114", "170199"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — açúcar (NCM 1701.14 bruto de cana e 1701.99 refinado).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["090121"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — café torrado (NCM 0901.21).",
    },
  },
  {
    tipo: "fixa",
    prefixos: ["2501"],
    regra: {
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      regime: REGIME_ALIQUOTA_ZERO,
      baseLegal: "Lei nº 10.925/2004, art. 1º — sal.",
    },
  },

  // ---------------------------------------------------------------------
  // Substituição tributária federal de PIS/COFINS — CST 05.
  // ---------------------------------------------------------------------
  {
    tipo: "fixa",
    prefixos: ["2402"],
    regra: {
      cstPisCofins: "05",
      pis: 0,
      cofins: 0,
      regime: REGIME_ST_FEDERAL,
      baseLegal: "Lei nº 9.532/1997, art. 53 — cigarros, sujeitos à substituição tributária federal de PIS/COFINS.",
    },
  },
];

export type ResultadoRegraFederal =
  | { tipo: "regra"; regra: RegraFederalAplicada }
  | { tipo: "ambiguo"; motivo: string }
  | { tipo: "nenhuma" };

/**
 * Resolve o regime federal de PIS/COFINS de um produto por NCM (casamento
 * por prefixo, entradas específicas antes das genéricas) e, quando o NCM
 * sozinho não decide, por palavra-chave no Nome (já normalizado — sem
 * acento, minúsculo). Retorna `{tipo:"nenhuma"}` quando nada bate — nesse
 * caso o chamador aplica o Padrão A/B normalmente (CST 01, tributado
 * normal).
 */
export function resolverRegimeFederal(ncmDigitos: string, nomeNormalizado: string): ResultadoRegraFederal {
  for (const entrada of REGRAS_FEDERAIS_PIS_COFINS) {
    if (!entrada.prefixos.some((p) => ncmDigitos.startsWith(p))) continue;

    if (entrada.tipo === "fixa") {
      return { tipo: "regra", regra: entrada.regra };
    }
    if (entrada.tipo === "ambigua") {
      return { tipo: "ambiguo", motivo: entrada.motivo };
    }

    if (entrada.palavrasChaveAplicar.some((k) => nomeNormalizado.includes(k))) {
      return { tipo: "regra", regra: entrada.regra };
    }
    if (entrada.palavrasChaveNaoAplicar.some((k) => nomeNormalizado.includes(k))) {
      return { tipo: "nenhuma" };
    }
    return { tipo: "ambiguo", motivo: entrada.motivoAmbiguo };
  }
  return { tipo: "nenhuma" };
}
