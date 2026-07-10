// Tabelas de referência do motor de classificação (lib/rules.ts).
//
// Isolado da interface de propósito: novos NCMs, alíquotas ou padrões devem
// ser adicionados aqui sem tocar em app/.

/**
 * Alíquotas de teste do IBS/CBS (Informe Técnico NF-e 2025.002, fase de
 * testes da LC nº 214/2025). Trocar aqui quando as alíquotas oficiais
 * entrarem em vigor — usadas em todos os padrões abaixo.
 */
export const ALIQUOTA_IBS_TESTE = 0.1;
export const ALIQUOTA_CBS_TESTE = 0.9;

/** Valores padrão aplicados quando a linha está em branco e a Tributação é "Tributado" (regime não-cumulativo de PIS/COFINS). */
export const PADRAO_TRIBUTADO = {
  cfopSaidas: "5102",
  cstIcms: "000",
  cstPisCofins: "01",
  pis: 1.65,
  cofins: 7.6,
  natReceita: "",
  cstIbsCbs: "000",
  cclasstrib: "000001",
  redBc: null as number | null,
  ibs: ALIQUOTA_IBS_TESTE,
  cbs: ALIQUOTA_CBS_TESTE,
};

/** Valores padrão aplicados quando a linha está em branco e a Tributação é "Substituição tributária" (regime não-cumulativo de PIS/COFINS). */
export const PADRAO_ST = {
  cfopSaidas: "5405",
  cstIcms: "060",
  cstPisCofins: "01",
  pis: 1.65,
  cofins: 7.6,
  natReceita: "",
  cstIbsCbs: "000",
  cclasstrib: "000001",
  redBc: null as number | null,
  ibs: ALIQUOTA_IBS_TESTE,
  cbs: ALIQUOTA_CBS_TESTE,
};

/**
 * Variantes para regime cumulativo de PIS/COFINS (típico de Lucro
 * Presumido/Simples Nacional — Lei nº 9.718/1998, art. 3º c/c Lei nº
 * 10.833/2003, art. 10): mesmas regras de CFOP/CST/IBS/CBS, alíquotas de
 * PIS/COFINS combinadas em 0,65%/3,00% ao invés do não-cumulativo
 * (1,65%/7,6%). Selecionadas por `lib/rules.ts` conforme o regime da
 * empresa (Bloco 1) ou uma instrução de processamento (Bloco 2).
 */
export const PADRAO_TRIBUTADO_CUMULATIVO = { ...PADRAO_TRIBUTADO, pis: 0.65, cofins: 3.0 };
export const PADRAO_ST_CUMULATIVO = { ...PADRAO_ST, pis: 0.65, cofins: 3.0 };

export type PadraoTributacao = typeof PADRAO_TRIBUTADO;

/**
 * Sobrescrita de classificação aplicada por prefixo de NCM, além (ou no lugar)
 * do padrão de Tributação.
 *
 * Importante: este tipo NÃO tem campos `cfopSaidas`/`cstIcms` de propósito —
 * a decisão de Substituição Tributária nunca pode vir de uma entrada fixa
 * desta tabela. ST é decidida exclusivamente pelos anexos ativos da empresa
 * (`lib/anexos.ts`, ver prioridade em `lib/rules.ts`) ou, na ausência de
 * qualquer anexo, pela coluna Tributação da planilha do cliente. Se um dia
 * for necessário sinalizar aqui que um NCM É objeto de ST, isso deve ser
 * feito cadastrando o NCM em um anexo — nunca adicionando campos de CFOP/CST
 * ICMS a este tipo.
 *
 * Também NÃO tem campos de PIS/COFINS (`cstPisCofins`/`pis`/`cofins`/
 * `natReceita`) de propósito — o regime federal de PIS/COFINS é uma
 * obrigação distinta do IBS/CBS (bases legais e listas de NCM diferentes) e
 * vive em `lib/regras-federais.ts`, para não duplicar/conflitar decisões
 * entre as duas tabelas.
 */
export interface OverrideClassificacao {
  cstIbsCbs?: string;
  cclasstrib?: string;
  redBc?: number | null;
  observacao: string;
  /**
   * Quando true, o NCM é sabidamente ambíguo (o mesmo código cobre
   * produtos com tratamentos tributários diferentes conforme a descrição —
   * ex.: 9619 pode ser absorvente higiênico ou fralda). O motor nunca
   * aplica os valores acima nesse caso: a linha vira "Dúvida — aguardando
   * instrução" citando `observacao`.
   */
  ambiguo?: boolean;
}

export interface NcmOverrideEntry {
  /** Prefixos comparados contra o NCM normalizado (só dígitos, sem pontos). */
  prefixos: string[];
  override: OverrideClassificacao;
}

/**
 * Tabela aberta de sobrescritas por NCM, focada no sortimento típico de
 * supermercado na Bahia. Adicione novas entradas conforme casos reais
 * forem aparecendo na planilha dos clientes — cada entrada tem prioridade
 * sobre o padrão de Tributação (Padrão A/B) para os campos que ela define.
 * Entradas são avaliadas na ordem declarada (a primeira que combinar com o
 * NCM vence) — por isso os prefixos mais específicos vêm antes dos mais
 * genéricos (ex.: capítulo inteiro "07").
 */
export const NCM_OVERRIDES: NcmOverrideEntry[] = [
  // ---------------------------------------------------------------------
  // Cesta básica nacional — redução de 100% no IBS/CBS (LC nº 214/2025,
  // Anexo I). O regime federal de PIS/COFINS desses mesmos NCMs (que usa
  // uma lista própria, não idêntica a esta) é resolvido separadamente em
  // lib/regras-federais.ts.
  // ---------------------------------------------------------------------
  {
    prefixos: [
      "1006", // arroz
      "0713", // feijão e outras leguminosas secas
      "0401", // leite fluido
      "190590", // pão comum
      "1701", // açúcar
      "1507", // óleo de soja
      "1101", // farinha de trigo
      "110620", // farinha de mandioca
      "0901", // café torrado
      "2501", // sal
      "0407", // ovos
      "0201", "0202", "0203", "0204", "0207", // carnes frescas bovinas/suínas/aves
      "1902", // macarrão/massas alimentícias comuns
      "03", // peixes frescos (capítulo 3)
      "07", // hortaliças frescas (capítulo 7 — inclui 0713 já listado acima)
      "08", // frutas frescas (capítulo 8)
    ],
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200003",
      redBc: 100,
      observacao: "Cesta básica nacional — redução de 100% no IBS/CBS (LC nº 214/2025, Anexo I).",
    },
  },

  // ---------------------------------------------------------------------
  // Higiene pessoal básica e saúde — redução de 60% no IBS/CBS (LC nº
  // 214/2025, Anexo). cClassTrib varia por categoria (200034 a 200040).
  // ---------------------------------------------------------------------
  {
    prefixos: ["96032100"], // escovas dentais
    override: { cstIbsCbs: "200", cclasstrib: "200035", redBc: 60, observacao: "Escovas dentais (redução 60%)." },
  },
  {
    prefixos: ["3306"], // creme dental e demais preparações de higiene bucal
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200036",
      redBc: 60,
      observacao: "Higiene bucal (creme dental etc.) — redução 60% no IBS/CBS.",
    },
  },
  {
    prefixos: ["3401"], // sabonetes e sabões
    override: { cstIbsCbs: "200", cclasstrib: "200037", redBc: 60, observacao: "Sabonetes (redução 60%)." },
  },
  {
    prefixos: ["3808"], // inseticidas e saneantes domissanitários
    override: { cstIbsCbs: "200", cclasstrib: "200038", redBc: 60, observacao: "Inseticidas domésticos (redução 60%)." },
  },
  {
    prefixos: ["3004"], // medicamentos (retail de farmácia/supermercado)
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200039",
      redBc: 60,
      observacao:
        "Medicamentos (redução 60%). O NCM não distingue genérico de referência/similar — confirme a categoria do produto antes de emitir.",
    },
  },
  {
    prefixos: ["9018", "9021"], // dispositivos e produtos de saúde
    override: { cstIbsCbs: "200", cclasstrib: "200040", redBc: 60, observacao: "Produtos de saúde (redução 60%)." },
  },
  {
    prefixos: ["9619"], // absorventes e fraldas — mesmo NCM, tratamentos diferentes
    override: {
      ambiguo: true,
      observacao:
        'NCM 9619 cobre tanto absorventes higiênicos (redução 60% no IBS/CBS) quanto fraldas — confirme a descrição do produto antes de classificar.',
    },
  },
];

/*
 * Referência: ST típica de supermercado na Bahia (RICMS-BA, Decreto nº
 * 13.780/2012, Anexo I). A decisão de ST em si NÃO vem desta tabela — ela é
 * definida pelos anexos ativos da empresa (lib/anexos.ts, Bloco 3), que
 * são a fonte de verdade sobre quais NCMs estão sujeitos a ST na prática.
 * Categorias mais comuns para conferir contra o anexo: bebidas frias,
 * sorvetes, cigarros, cosméticos, lâmpadas, pilhas e baterias, materiais
 * de limpeza, ração animal.
 */

export function buscarOverridePorNcm(ncmDigitos: string): OverrideClassificacao | undefined {
  const entrada = NCM_OVERRIDES.find((e) => e.prefixos.some((p) => ncmDigitos.startsWith(p)));
  return entrada?.override;
}

// ---------------------------------------------------------------------
// FCP 2% — Fundo Estadual de Combate e Erradicação da Pobreza (Bahia),
// Instrução Normativa SAT nº 005/2016, para produtos de perfumaria e
// cosméticos. Preenche a coluna "ALIQ. FCP" da planilha de saída. É uma
// obrigação independente da Substituição Tributária (Bloco 3) — um produto
// pode levar FCP 2% sem ser ST, e vice-versa.
// ---------------------------------------------------------------------

/** Alíquota do FCP-BA para os itens de perfumaria/cosméticos da IN SAT nº 005/2016. */
export const ALIQUOTA_FCP_COSMETICOS_BA = 2;

interface FaixaFcpBa {
  inicio: string;
  fim: string;
  descricao: string;
}

interface PrefixoFcpBa {
  prefixo: string;
  descricao: string;
}

/** Prefixos de NCM (qualquer comprimento) que levam FCP 2% na íntegra do subitem. */
const FCP_BA_PREFIXOS: PrefixoFcpBa[] = [
  { prefixo: "33041", descricao: "produtos de maquiagem para os lábios (batom, gloss)" },
  { prefixo: "33043", descricao: "preparações para manicuros e pedicuros, esmaltes, removedores de esmalte" },
  { prefixo: "330491", descricao: "pós, incluindo compactos, para maquilagem" },
  { prefixo: "33052", descricao: "preparações para ondulação/alisamento permanentes dos cabelos" },
  { prefixo: "33053", descricao: "laquês, fixadores e gel fixador" },
  {
    prefixo: "33059",
    descricao: "tinturas capilares, tonalizantes, xampus colorantes, máscaras capilares, finalizadores",
  },
  { prefixo: "33073", descricao: "sais perfumados e outras preparações para banhos" },
  { prefixo: "33079", descricao: "depilatórios, ceras, papéis perfumados" },
  { prefixo: "2847", descricao: "água oxigenada 10 a 40 volumes" },
  { prefixo: "48182", descricao: "lenços de desmaquilar" },
];

/** Faixas de NCM de 8 dígitos (início/fim inclusive) que levam FCP 2%. */
const FCP_BA_FAIXAS: FaixaFcpBa[] = [
  { inicio: "33042010", fim: "33042019", descricao: "sombra, delineador, lápis para sobrancelhas, rímel" },
  { inicio: "33042090", fim: "33042099", descricao: "outros produtos de maquiagem para os olhos" },
  { inicio: "33049910", fim: "33049919", descricao: "cremes de beleza, cremes nutritivos, loções tônicas, esfoliantes" },
  { inicio: "33049990", fim: "33049999", descricao: "outros produtos de beleza e cuidados da pele, bronzeadores" },
];

// NCM 3303 (perfumes e águas de colônia) NÃO consta na IN SAT nº 005/2016 —
// não leva FCP 2%. Omissão intencional das listas acima; documentado aqui
// para não ser "corrigido" por engano no futuro.

function localizarNaListaFcp(ncmDigitos: string): { descricao: string } | null {
  const prefixo = FCP_BA_PREFIXOS.find((p) => ncmDigitos.startsWith(p.prefixo));
  if (prefixo) return { descricao: prefixo.descricao };
  if (ncmDigitos.length === 8) {
    const faixa = FCP_BA_FAIXAS.find((f) => ncmDigitos >= f.inicio && ncmDigitos <= f.fim);
    if (faixa) return { descricao: faixa.descricao };
  }
  return null;
}

const REGEX_DIACRITICOS_FCP = /[\u0300-\u036f]/g;
function normalizarNomeFcp(v: string): string {
  return v
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS_FCP, "")
    .toLowerCase()
    .trim();
}

export interface AvaliacaoFcpCosmeticos {
  /** true = deve levar FCP 2%; false = cai numa exceção da IN 005/2016 (não leva). */
  aplicaFcp: boolean;
  descricao?: string;
  /** Motivo da exceção, quando aplicaFcp é false por um casamento de palavra-chave no Nome. */
  excecao?: string;
  /** Nome vazio/insuficiente para checar as exceções — regra de ouro: nunca chutar. */
  ambiguo?: boolean;
  motivoAmbiguo?: string;
}

/**
 * Avalia se um produto leva FCP 2% (IN SAT nº 005/2016), conferindo o NCM
 * contra as listas acima e as exceções documentadas por palavra-chave no
 * Nome do produto. Retorna `null` quando o NCM não está sujeito ao FCP de
 * cosméticos (a maioria dos produtos) — nesse caso a coluna ALIQ. FCP não é
 * tocada pelo motor.
 */
export function avaliarFcpCosmeticos(ncmDigitos: string, nomeOriginal: string): AvaliacaoFcpCosmeticos | null {
  if (ncmDigitos.length !== 8) return null;
  const achado = localizarNaListaFcp(ncmDigitos);
  if (!achado) return null;

  const nome = normalizarNomeFcp(nomeOriginal);
  if (!nome) {
    return {
      aplicaFcp: false,
      ambiguo: true,
      motivoAmbiguo:
        "NCM consta na lista de FCP 2% (IN SAT nº 005/2016), mas o produto não tem Nome preenchido para conferir as exceções da instrução normativa.",
    };
  }

  if (ncmDigitos.startsWith("330499") && /protetor solar|bronzeador solar|anti-solar|antissolar|\bfps\b/.test(nome)) {
    return { aplicaFcp: false, excecao: "protetor/bronzeador solar — exceção do 3304.99 (preparações anti-solares)" };
  }
  if (ncmDigitos.startsWith("330499") && nome.includes("assadura")) {
    return { aplicaFcp: false, excecao: "creme para assadura — exceção do 3304.99" };
  }
  if (ncmDigitos.startsWith("33059") && nome.includes("condicionador") && !/shampoo|xampu/.test(nome)) {
    return { aplicaFcp: false, excecao: "condicionador como produto principal — exceção do 3305.9" };
  }
  if (ncmDigitos.startsWith("330491") && (nome.includes("talco") || nome.includes("polvilho"))) {
    return { aplicaFcp: false, excecao: "talco/polvilho — exceção do 3304.91" };
  }
  if (
    (ncmDigitos.startsWith("3304999") || ncmDigitos.startsWith("2847")) &&
    (nome.includes("medicamento") || nome.includes("uso medicinal"))
  ) {
    return { aplicaFcp: false, excecao: "uso medicinal — exceção do 3304.99.9 / água oxigenada medicinal" };
  }

  return { aplicaFcp: true, descricao: achado.descricao };
}
