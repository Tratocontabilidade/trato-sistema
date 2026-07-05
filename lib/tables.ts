// Tabelas de referência do motor de classificação (lib/rules.ts).
//
// Isolado da interface de propósito: novos NCMs, alíquotas ou padrões devem
// ser adicionados aqui sem tocar em app/.

/** Valores padrão aplicados quando a linha está em branco e a Tributação é "Tributado". */
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
  ibs: 0.1,
  cbs: 0.9,
};

/** Valores padrão aplicados quando a linha está em branco e a Tributação é "Substituição tributária". */
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
  ibs: 0.1,
  cbs: 0.9,
};

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
}

export interface NcmOverrideEntry {
  /** Prefixos comparados contra o NCM normalizado (só dígitos, sem pontos). */
  prefixos: string[];
  override: OverrideClassificacao;
}

/**
 * Tabela aberta de sobrescritas por NCM. Adicione novas entradas conforme
 * casos reais forem aparecendo na planilha dos clientes — cada entrada tem
 * prioridade sobre o padrão de Tributação (Padrão A/B) para os campos que
 * ela define.
 */
export const NCM_OVERRIDES: NcmOverrideEntry[] = [
  {
    prefixos: ["0201", "0202", "0203", "0204", "0207"],
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200003",
      redBc: 100,
      observacao: "Cesta básica — carnes bovinas/suínas/aves (redução 100%).",
    },
  },
  {
    prefixos: ["96032100"],
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200035",
      redBc: 60,
      observacao: "Escovas dentais (redução 60%).",
    },
  },
  {
    prefixos: ["3808"],
    override: {
      cstIbsCbs: "200",
      cclasstrib: "200038",
      redBc: 60,
      observacao: "Inseticidas domésticos (redução 60%).",
    },
  },
  {
    prefixos: ["3305", "3307"],
    override: {
      cstPisCofins: "04",
      pis: 0,
      cofins: 0,
      natReceita: "002",
      observacao: "Cosméticos/higiene pessoal — monofásico, revenda a alíquota zero.",
    },
  },
];

export function buscarOverridePorNcm(ncmDigitos: string): OverrideClassificacao | undefined {
  const entrada = NCM_OVERRIDES.find((e) => e.prefixos.some((p) => ncmDigitos.startsWith(p)));
  return entrada?.override;
}
