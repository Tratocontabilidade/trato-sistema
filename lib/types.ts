// Tipos compartilhados entre lib/rules.ts, lib/tables.ts, lib/excel.ts e a interface.

export type SimNaoVerificar = "sim" | "nao" | "verificar";

export type TipoOperacao =
  | "venda"
  | "compra"
  | "devolucao_compra"
  | "devolucao_venda"
  | "transferencia"
  | "bonificacao_doacao"
  | "remessa_conserto"
  | "retorno_conserto";

export type Destino = "interna" | "interestadual" | "exportacao";

export type Destinatario = "consumidor_final" | "contribuinte" | "orgao_publico";

/** Linha lida da planilha de entrada (aba "Produtos"). */
export interface ProdutoEntrada {
  codigo: string;
  descricao: string;
  ncm: string;
  origem: string;
  tipoOperacao: TipoOperacao;
  destino: Destino;
  destinatario: Destinatario;
  stBahia: SimNaoVerificar;
  monofasicoPisCofins: SimNaoVerificar;
  isentoPisCofins: SimNaoVerificar;
  anexoLc214: SimNaoVerificar;
  /** Linha original da planilha, para mensagens de erro. */
  linha: number;
}

/** Código + descrição de uma classificação fiscal. */
export interface CodigoDescricao {
  codigo: string;
  descricao: string;
}

export interface ClassTrib extends CodigoDescricao {
  baseLegal: string;
}

export interface Alerta {
  campo: string;
  mensagem: string;
  norma: string;
}

/** Resultado da classificação de um produto. */
export interface ProdutoResultado {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: CodigoDescricao;
  cstPis: CodigoDescricao;
  cstCofins: CodigoDescricao;
  cstIbsCbs: CodigoDescricao;
  cClassTrib: ClassTrib;
  alertas: Alerta[];
  linha: number;
}
