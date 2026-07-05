"use client";

import { useEffect, useState } from "react";
import { listarEmpresas, salvarEmpresa, type Empresa, type RegraAprendida } from "@/lib/empresas";
import { listarHistorico, obterResultadoEmCache, type HistoricoProcessamento } from "@/lib/historico";
import { lerPlanilhaCliente } from "@/lib/excel";
import { compararResultados } from "@/lib/aprendizado";
import { Selo } from "../components/Selo";
import { ThemeToggle } from "../components/ThemeToggle";
import { UploadArea } from "../components/UploadArea";
import { RevisaoAprendizado, type ItemRevisao } from "../components/RevisaoAprendizado";

export default function AprenderPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [historico, setHistorico] = useState<HistoricoProcessamento[]>([]);
  const [historicoId, setHistoricoId] = useState("");
  const [itens, setItens] = useState<ItemRevisao[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    setEmpresas(listarEmpresas());
  }, []);

  useEffect(() => {
    setHistorico(empresaId ? listarHistorico(empresaId) : []);
    setHistoricoId("");
    setItens([]);
    setMensagem(null);
  }, [empresaId]);

  async function handleArquivoCorrigido(arquivo: File) {
    setMensagem(null);
    const cache = obterResultadoEmCache(historicoId);
    if (!cache) {
      setMensagem(
        "O resultado dessa execução não está mais disponível em memória (isso acontece após recarregar a página). Reprocesse a planilha original e tente de novo."
      );
      return;
    }
    const buffer = await arquivo.arrayBuffer();
    const { produtos, contexto } = lerPlanilhaCliente(buffer);
    if (!contexto) {
      setMensagem("Não foi possível ler a planilha corrigida — confira se é o mesmo layout do Cadastro de Produtos.");
      return;
    }
    const divergencias = compararResultados(cache.resultados, produtos);
    setItens(divergencias.map((d) => ({ ...d, status: "pendente" as const })));
    if (divergencias.length === 0) {
      setMensagem("Nenhuma divergência encontrada entre o processamento anterior e a planilha corrigida.");
    }
  }

  function aprovar(i: number) {
    setItens((atual) => atual.map((it, idx) => (idx === i ? { ...it, status: "aprovada" } : it)));
  }
  function descartar(i: number) {
    setItens((atual) => atual.map((it, idx) => (idx === i ? { ...it, status: "descartada" } : it)));
  }
  function aprovarTodasDoNcm(ncm: string) {
    setItens((atual) =>
      atual.map((it) => (it.ncm === ncm && it.status === "pendente" ? { ...it, status: "aprovada" } : it))
    );
  }

  function salvarRegrasAprovadas() {
    const empresa = empresas.find((e) => e.id === empresaId);
    if (!empresa) return;
    const aprovadas = itens.filter((i) => i.status === "aprovada");
    if (aprovadas.length === 0) {
      setMensagem("Nenhuma regra aprovada para salvar ainda.");
      return;
    }

    const novasRegras: RegraAprendida[] = aprovadas.map((it) => ({
      ncm: it.ncm,
      campo: it.campo,
      valorAnterior: it.valorAnterior,
      valorNovo: it.valorNovo,
      origem: "Aprendizado com correção manual",
      aprovadoEm: new Date().toISOString(),
    }));

    const chaves = new Set(novasRegras.map((r) => `${r.ncm}|${r.campo}`));
    const regrasAntigas = empresa.regrasAprendidas.filter((r) => !chaves.has(`${r.ncm}|${r.campo}`));
    const atualizada: Empresa = { ...empresa, regrasAprendidas: [...regrasAntigas, ...novasRegras] };
    salvarEmpresa(atualizada);
    setEmpresas((atual) => atual.map((e) => (e.id === atualizada.id ? atualizada : e)));
    setMensagem(`${novasRegras.length} regra(s) salva(s) para ${empresa.nome}.`);
    setItens((atual) => atual.filter((it) => it.status !== "aprovada"));
  }

  return (
    <main>
      <div className="app-header">
        <Selo size={32} className="app-header-selo" title="Grade Tributária BA" />
        <h1>Aprender com correção</h1>
        <ThemeToggle />
      </div>
      <p className="subtitle">
        Compare um processamento anterior com a planilha que você corrigiu manualmente e decida quais
        correções viram regras permanentes para esta empresa. Nada é aplicado sem sua aprovação.
      </p>

      <div className="card">
        <div className="campo-grid">
          <div className="campo">
            <label htmlFor="aprender-empresa">Empresa</label>
            <select id="aprender-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">Selecione…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="aprender-historico">Processamento anterior</label>
            <select
              id="aprender-historico"
              value={historicoId}
              onChange={(e) => setHistoricoId(e.target.value)}
              disabled={!empresaId}
            >
              <option value="">Selecione…</option>
              {historico.map((h) => {
                const disponivel = Boolean(obterResultadoEmCache(h.id));
                return (
                  <option key={h.id} value={h.id} disabled={!disponivel}>
                    {h.nomeArquivo} — {new Date(h.dataHora).toLocaleString("pt-BR")}
                    {!disponivel ? " (indisponível)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {historicoId && (
          <>
            <p className="campo-ajuda">Envie a planilha que você corrigiu manualmente no Excel:</p>
            <UploadArea onFile={handleArquivoCorrigido} disabled={false} />
          </>
        )}

        {mensagem && <div className="disclaimer">{mensagem}</div>}
      </div>

      {itens.length > 0 && (
        <>
          <div className="actions-row">
            <button onClick={salvarRegrasAprovadas}>Salvar regras aprovadas</button>
          </div>
          <RevisaoAprendizado
            itens={itens}
            onAprovar={aprovar}
            onDescartar={descartar}
            onAprovarTodasDoNcm={aprovarTodasDoNcm}
          />
        </>
      )}
    </main>
  );
}
