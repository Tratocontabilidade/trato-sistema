// Tipos compartilhados entre lib/rules.ts, lib/tables.ts, lib/excel.ts e a interface.
//
// O sistema lê o layout fixo de planilha que os clientes do escritório
// enviam ("Cadastro de Produtos", 19 colunas) e devolve a mesma planilha
// com os campos de classificação preenchidos/validados, mais duas colunas
// de controle (Status e Observação).

import type { Diretiva } from "./instructions";
import type { AnexoEmpresa, RegraAprendida } from "./empresas";

export type StatusLinha =
  | "OK"
  | "Preenchido automaticamente"
  | "Divergência detectada"
  | "Revisar manualmente"
  | "Dúvida — aguardando instrução"
  | "Preenchido com inferência de NCM — revisar";

/**
 * Linha lida da planilha do cliente, já normalizada.
 *
 * Campos de repasse (código, nome, código de barras, UN, preço unit.) são
 * mantidos como vieram — o motor não os interpreta.
 *
 * ALIQ. FCP é repasse para a maioria dos NCMs, mas passa a ser interpretado
 * pelo motor para cosméticos/perfumaria sujeitos ao FCP 2% da Bahia (IN SAT
 * nº 005/2016) — ver `avaliarFcpCosmeticos` em lib/tables.ts.
 *
 * Campos de classificação (NCM em diante) são normalizados na leitura
 * (dígitos, largura de código) para que o motor possa comparar e validar.
 */
export interface ClientProdutoEntrada {
  /** Linha da planilha original (1-based, para mensagens de erro). */
  linha: number;

  // Repasse — não interpretados pelo motor.
  codigo: string | number;
  nome: string | number;
  codigoBarras: string | number;
  un: string | number;
  precoUnit: string | number;
  aliqFcp: string | number;

  // Usados pelo motor de classificação.
  tributacao: string;
  ncmOriginal: string;
  /** Apenas dígitos, sem pontuação. Pode ter comprimento diferente de 8 se a planilha vier suja. */
  ncm: string;
  cfopSaidas: string;
  cstIcms: string;
  cstPisCofins: string;
  pis: number | null;
  cofins: number | null;
  natReceita: string;
  cstIbsCbs: string;
  cclasstrib: string;
  redBc: number | null;
  ibs: number | null;
  cbs: number | null;
}

/** Linha após passar pelo motor de classificação. */
export interface ClientProdutoResultado extends ClientProdutoEntrada {
  status: StatusLinha;
  observacao: string;
}

/**
 * Contexto opcional passado ao motor para um processamento específico:
 * regime de PIS/COFINS já resolvido (instrução do processamento > regime
 * cadastrado na empresa > padrão não-cumulativo) e as diretivas
 * interpretadas de `lib/instructions.ts` que dependem do produto (exclusão
 * de segmento, padrão forçado, redução por segmento).
 */
export interface ContextoClassificacao {
  regime: "cumulativo" | "nao_cumulativo";
  diretivas: Diretiva[];
  /** Anexos ativos da empresa (Bloco 3) — quando presentes, decidem ST por NCM com prioridade sobre a coluna Tributação. */
  anexosAtivos?: AnexoEmpresa[];
  /** Regras aprendidas da empresa (Bloco 5) — maior prioridade de todas, por NCM+campo. */
  regrasAprendidas?: RegraAprendida[];
}
