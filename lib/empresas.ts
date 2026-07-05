// Cadastro de empresas/clientes do escritório — persistido em localStorage
// (lib/armazenamento.ts). Cada empresa carrega suas próprias instruções
// personalizadas (lib/instructions.ts), anexos de ST (lib/anexos.ts) e
// regras aprendidas com correções manuais (lib/aprendizado.ts).

import { gerarId, gravarJSON, lerJSON } from "./armazenamento";

export type RegimeTributario = "Lucro Real" | "Lucro Presumido" | "Simples Nacional";

export const REGIMES_TRIBUTARIOS: RegimeTributario[] = ["Lucro Real", "Lucro Presumido", "Simples Nacional"];

export interface AnexoColunas {
  ncm: number;
  descricao?: number;
  mva?: number;
}

export interface LinhaAnexo {
  /** Prefixo ou NCM completo, só dígitos. */
  ncm: string;
  descricao?: string;
  mva?: number;
}

export interface AnexoEmpresa {
  id: string;
  nome: string;
  ativo: boolean;
  colunas: AnexoColunas;
  linhas: LinhaAnexo[];
  criadoEm: string;
}

export interface RegraAprendida {
  ncm: string;
  campo: string;
  valorAnterior: string;
  valorNovo: string;
  origem: string;
  aprovadoEm: string;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  ramo: string;
  uf: string;
  regimeTributario: RegimeTributario;
  instrucoesPersonalizadas: string;
  anexos: AnexoEmpresa[];
  regrasAprendidas: RegraAprendida[];
  criadoEm: string;
  atualizadoEm: string;
}

export type NovaEmpresaInput = Pick<
  Empresa,
  "nome" | "cnpj" | "ramo" | "uf" | "regimeTributario" | "instrucoesPersonalizadas"
>;

const CHAVE_EMPRESAS = "empresas";

export function listarEmpresas(): Empresa[] {
  return lerJSON<Empresa[]>(CHAVE_EMPRESAS, []);
}

export function obterEmpresa(id: string): Empresa | undefined {
  return listarEmpresas().find((e) => e.id === id);
}

export function criarEmpresa(dados: NovaEmpresaInput): Empresa {
  const agora = new Date().toISOString();
  const empresa: Empresa = {
    ...dados,
    id: gerarId(),
    anexos: [],
    regrasAprendidas: [],
    criadoEm: agora,
    atualizadoEm: agora,
  };
  const empresas = listarEmpresas();
  empresas.push(empresa);
  gravarJSON(CHAVE_EMPRESAS, empresas);
  return empresa;
}

export function salvarEmpresa(empresa: Empresa): void {
  const empresas = listarEmpresas();
  const indice = empresas.findIndex((e) => e.id === empresa.id);
  const atualizada: Empresa = { ...empresa, atualizadoEm: new Date().toISOString() };
  if (indice >= 0) empresas[indice] = atualizada;
  else empresas.push(atualizada);
  gravarJSON(CHAVE_EMPRESAS, empresas);
}

export function removerEmpresa(id: string): void {
  const empresas = listarEmpresas().filter((e) => e.id !== id);
  gravarJSON(CHAVE_EMPRESAS, empresas);
}
