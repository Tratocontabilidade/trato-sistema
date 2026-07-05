// Histórico de processamentos por empresa. Metadados (data, arquivo,
// instruções aplicadas, anexos ativos, contadores) persistem em
// localStorage; os resultados completos de cada execução ficam só em
// memória (Map do módulo, perdido ao recarregar a página) — não é seguro
// guardar planilhas de dezenas de milhares de linhas em localStorage.

import { gerarId, gravarJSON, lerJSON } from "./armazenamento";
import type { ClientProdutoResultado } from "./types";
import type { PlanilhaClienteContexto } from "./excel";

export interface ContadoresHistorico {
  total: number;
  ok: number;
  preenchidos: number;
  revisar: number;
  divergentes: number;
  duvidas: number;
}

export interface HistoricoProcessamento {
  id: string;
  empresaId: string;
  dataHora: string;
  nomeArquivo: string;
  instrucoesAplicadas: string[];
  anexosAtivos: string[];
  contadores: ContadoresHistorico;
}

const CHAVE_HISTORICO = "historico";
const LIMITE_POR_EMPRESA = 20;

interface ResultadoEmCache {
  resultados: ClientProdutoResultado[];
  contexto: PlanilhaClienteContexto;
}

// Cache em memória — não sobrevive a um reload de página.
const cacheResultados = new Map<string, ResultadoEmCache>();

export function listarHistorico(empresaId?: string): HistoricoProcessamento[] {
  const todos = lerJSON<HistoricoProcessamento[]>(CHAVE_HISTORICO, []);
  const filtrados = empresaId ? todos.filter((h) => h.empresaId === empresaId) : todos;
  return filtrados.slice().sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}

export function registrarProcessamento(dados: {
  empresaId: string;
  nomeArquivo: string;
  instrucoesAplicadas: string[];
  anexosAtivos: string[];
  contadores: ContadoresHistorico;
  resultados: ClientProdutoResultado[];
  contexto: PlanilhaClienteContexto;
}): HistoricoProcessamento {
  const registro: HistoricoProcessamento = {
    id: gerarId(),
    empresaId: dados.empresaId,
    dataHora: new Date().toISOString(),
    nomeArquivo: dados.nomeArquivo,
    instrucoesAplicadas: dados.instrucoesAplicadas,
    anexosAtivos: dados.anexosAtivos,
    contadores: dados.contadores,
  };

  const todos = lerJSON<HistoricoProcessamento[]>(CHAVE_HISTORICO, []);
  todos.push(registro);

  // Mantém só as N mais recentes por empresa, para não estourar a cota do localStorage.
  const daEmpresa = todos
    .filter((h) => h.empresaId === dados.empresaId)
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  const idsRemover = new Set(daEmpresa.slice(LIMITE_POR_EMPRESA).map((h) => h.id));
  let restantes = todos.filter((h) => !idsRemover.has(h.id));

  let gravou = gravarJSON(CHAVE_HISTORICO, restantes);
  while (!gravou && restantes.length > 1) {
    // Cota excedida mesmo após aparar por empresa — remove a entrada mais antiga globalmente.
    const maisAntiga = restantes.slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora))[0];
    idsRemover.add(maisAntiga.id);
    restantes = restantes.filter((h) => h.id !== maisAntiga.id);
    gravou = gravarJSON(CHAVE_HISTORICO, restantes);
  }

  cacheResultados.set(registro.id, { resultados: dados.resultados, contexto: dados.contexto });
  for (const id of idsRemover) cacheResultados.delete(id);

  return registro;
}

export function obterResultadoEmCache(id: string): ResultadoEmCache | undefined {
  return cacheResultados.get(id);
}
