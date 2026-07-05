// Tipos compartilhados entre lib/rules.ts, lib/tables.ts, lib/excel.ts e a interface.
//
// O sistema lê o layout fixo de planilha que os clientes do escritório
// enviam ("Cadastro de Produtos", 19 colunas) e devolve a mesma planilha
// com os campos de classificação preenchidos/validados, mais duas colunas
// de controle (Status e Observação).

export type StatusLinha =
  | "OK"
  | "Preenchido automaticamente"
  | "Divergência detectada"
  | "Revisar manualmente";

/**
 * Linha lida da planilha do cliente, já normalizada.
 *
 * Campos de repasse (código, nome, código de barras, UN, preço unit., ALIQ.
 * FCP) são mantidos como vieram — o motor não os interpreta.
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
