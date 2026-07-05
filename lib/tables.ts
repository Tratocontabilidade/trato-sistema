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

/** Sobrescrita de classificação aplicada por prefixo de NCM, além (ou no lugar) do padrão de Tributação. */
export interface OverrideClassificacao {
  cstIbsCbs?: string;
  cclasstrib?: string;
  redBc?: number | null;
  cstPisCofins?: string;
  pis?: number;
  cofins?: number;
  natReceita?: string;
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
  // Anexo I) e alíquota zero de PIS/COFINS (Lei nº 10.925/2004, art. 1º).
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
      cstPisCofins: "06",
      pis: 0,
      cofins: 0,
      observacao: "Cesta básica nacional — redução de 100% no IBS/CBS e alíquota zero de PIS/COFINS.",
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
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      observacao:
        "Higiene bucal (creme dental etc.) — redução 60% no IBS/CBS e monofásico de PIS/COFINS (Lei nº 10.147/2000).",
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

  // ---------------------------------------------------------------------
  // Monofásicos de PIS/COFINS — CST 04, alíquota zero na revenda (Lei nº
  // 10.147/2000 — cosméticos/higiene; Lei nº 13.097/2015 — bebidas frias).
  // (3306 já tratado acima, combinado com a redução de 60% do IBS/CBS.)
  // ---------------------------------------------------------------------
  {
    prefixos: ["3303", "3304", "3305", "3307"], // perfumaria, maquiagem, cosméticos capilares e outros
    override: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      observacao: "Cosméticos/perfumaria — monofásico, revenda a alíquota zero.",
    },
  },
  {
    prefixos: ["2202"], // refrigerantes e outras bebidas não alcoólicas
    override: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      observacao: "Refrigerantes — monofásico, revenda a alíquota zero (bebidas frias).",
    },
  },
  {
    prefixos: ["2203"], // cerveja de malte
    override: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      observacao: "Cerveja — monofásico, revenda a alíquota zero (bebidas frias).",
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
