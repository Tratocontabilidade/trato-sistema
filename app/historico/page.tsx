"use client";

import { useEffect, useState } from "react";
import { listarEmpresas, type Empresa } from "@/lib/empresas";
import { listarHistorico, obterResultadoEmCache, type HistoricoProcessamento } from "@/lib/historico";
import { gerarPlanilhaClienteResultado } from "@/lib/excel";
import { Selo } from "../components/Selo";
import { ThemeToggle } from "../components/ThemeToggle";

export default function HistoricoPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [historico, setHistorico] = useState<HistoricoProcessamento[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setEmpresas(listarEmpresas());
  }, []);

  useEffect(() => {
    setHistorico(empresaId ? listarHistorico(empresaId) : []);
    setAviso(null);
  }, [empresaId]);

  function baixar(id: string, nomeArquivo: string) {
    const cache = obterResultadoEmCache(id);
    if (!cache) {
      setAviso(
        "O resultado desta execução não está mais disponível em memória (isso acontece após recarregar a página). Reprocesse a planilha para baixar novamente."
      );
      return;
    }
    const bytes = gerarPlanilhaClienteResultado(cache.resultados, cache.contexto);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classificado-${nomeArquivo.replace(/\.xlsx?$/i, "")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <div className="app-header">
        <Selo size={32} className="app-header-selo" title="Grade Tributária BA" />
        <h1>Histórico</h1>
        <ThemeToggle />
      </div>
      <p className="subtitle">
        Processamentos anteriores por empresa. O arquivo de resultado fica disponível para baixar
        enquanto a página não for recarregada.
      </p>

      <div className="card">
        <div className="campo">
          <label htmlFor="historico-empresa">Empresa</label>
          <select id="historico-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Selecione…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aviso && <div className="disclaimer">{aviso}</div>}

      {empresaId &&
        (historico.length === 0 ? (
          <div className="card">Nenhum processamento registrado para esta empresa ainda.</div>
        ) : (
          <div className="lista-empresas">
            {historico.map((h) => (
              <div key={h.id} className="card empresa-card">
                <div>
                  <strong>{h.nomeArquivo}</strong>
                  <div className="empresa-card-meta">{new Date(h.dataHora).toLocaleString("pt-BR")}</div>
                  <div className="empresa-card-meta">
                    {h.contadores.total} produtos · {h.contadores.ok} OK · {h.contadores.preenchidos} preenchidos
                    automaticamente · {h.contadores.inferidos} com NCM inferido · {h.contadores.revisar} revisar
                    manualmente · {h.contadores.divergentes} divergência · {h.contadores.duvidas} dúvida
                  </div>
                  {h.anexosAtivos.length > 0 && (
                    <div className="empresa-card-meta">Anexos ativos: {h.anexosAtivos.join(", ")}</div>
                  )}
                  {h.instrucoesAplicadas.length > 0 && (
                    <div className="empresa-card-meta">Instruções aplicadas: {h.instrucoesAplicadas.join("; ")}</div>
                  )}
                </div>
                <div className="actions-row">
                  <button type="button" className="secondary" onClick={() => baixar(h.id, h.nomeArquivo)}>
                    Baixar resultado
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </main>
  );
}
