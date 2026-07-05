"use client";

import { useMemo, useState } from "react";
import { classificarProdutosClienteAsync } from "@/lib/rules";
import { gerarPlanilhaClienteResultado, lerPlanilhaCliente, type PlanilhaClienteContexto } from "@/lib/excel";
import type { ClientProdutoResultado } from "@/lib/types";
import { Selo } from "./components/Selo";
import { StepIndicator } from "./components/StepIndicator";
import { UploadArea } from "./components/UploadArea";
import { ResumoBar } from "./components/ResumoBar";
import { ResultadoTabela } from "./components/ResultadoTabela";
import { ProgressBar } from "./components/ProgressBar";
import { ThemeToggle } from "./components/ThemeToggle";

type Estado =
  | { fase: "vazio" }
  | { fase: "processando"; processados: number; total: number }
  | { fase: "erro"; mensagem: string }
  | {
      fase: "pronto";
      resultados: ClientProdutoResultado[];
      erros: string[];
      contexto: PlanilhaClienteContexto;
      nomeArquivo: string;
    };

function etapaAtual(estado: Estado): 1 | 2 | 3 {
  if (estado.fase === "pronto") return 3;
  if (estado.fase === "processando") return 2;
  return 1;
}

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });

  const resumo = useMemo(() => {
    if (estado.fase !== "pronto") return null;
    const total = estado.resultados.length;
    let ok = 0;
    let preenchidos = 0;
    let revisar = 0;
    let divergentes = 0;
    for (const r of estado.resultados) {
      if (r.status === "OK") ok++;
      else if (r.status === "Preenchido automaticamente") preenchidos++;
      else if (r.status === "Revisar manualmente") revisar++;
      else if (r.status === "Divergência detectada") divergentes++;
    }
    return { total, ok, preenchidos, revisar, divergentes };
  }, [estado]);

  async function processarArquivo(arquivo: File) {
    setEstado({ fase: "processando", processados: 0, total: 0 });
    try {
      const buffer = await arquivo.arrayBuffer();
      const { produtos, erros, contexto } = lerPlanilhaCliente(buffer);

      if (!contexto) {
        setEstado({ fase: "erro", mensagem: erros.join(" ") });
        return;
      }

      setEstado({ fase: "processando", processados: 0, total: produtos.length });
      const resultados = await classificarProdutosClienteAsync(produtos, {
        onProgresso: ({ processados, total }) => setEstado({ fase: "processando", processados, total }),
      });

      setEstado({ fase: "pronto", resultados, erros, contexto, nomeArquivo: arquivo.name });
    } catch (e) {
      setEstado({
        fase: "erro",
        mensagem: e instanceof Error ? e.message : "Falha desconhecida ao ler a planilha.",
      });
    }
  }

  function baixarResultado() {
    if (estado.fase !== "pronto") return;
    const bytes = gerarPlanilhaClienteResultado(estado.resultados, estado.contexto);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classificado-${estado.nomeArquivo.replace(/\.xlsx?$/i, "")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function limpar() {
    setEstado({ fase: "vazio" });
  }

  return (
    <main>
      <div className="app-header">
        <Selo size={32} className="app-header-selo" title="Grade Tributária BA" />
        <h1>Grade Tributária BA</h1>
        <ThemeToggle />
      </div>
      <p className="subtitle">
        Classificação fiscal do "Cadastro de Produtos" — preenche automaticamente CFOP, CST, PIS/COFINS
        e CST/cClassTrib de IBS/CBS, e valida os campos já preenchidos.
      </p>

      <StepIndicator atual={etapaAtual(estado)} />

      <div className="disclaimer">
        Este sistema apoia o trabalho do analista fiscal, mas <strong>não substitui a revisão
        técnica</strong> antes da emissão de documentos fiscais. Linhas com status diferente de "OK"
        exigem confirmação humana antes do uso. A tabela de cClassTrib do IBS/CBS muda com frequência —
        confirme sempre a versão vigente do Informe Técnico NF-e no{" "}
        <a className="link" href="https://www.nfe.fazenda.gov.br" target="_blank" rel="noreferrer">
          Portal Nacional da NF-e
        </a>
        .
      </div>

      {estado.fase !== "pronto" && (
        <div className="card">
          <UploadArea onFile={processarArquivo} disabled={estado.fase === "processando"} />

          <div className="actions-row">
            <a className="link" href="/planilha-modelo.xlsx" download style={{ marginLeft: "auto" }}>
              Baixar planilha-modelo
            </a>
          </div>

          {estado.fase === "processando" && (
            <ProgressBar processados={estado.processados} total={estado.total} />
          )}

          {estado.fase === "erro" && (
            <div className="erros">Erro ao processar a planilha: {estado.mensagem}</div>
          )}
        </div>
      )}

      {estado.fase === "pronto" && (
        <>
          <div className="actions-row">
            <button onClick={baixarResultado}>Baixar planilha classificada</button>
            <button className="secondary" onClick={limpar}>
              Nova planilha
            </button>
          </div>

          {estado.erros.length > 0 && (
            <div className="erros">
              {estado.erros.length} aviso(s) na leitura da planilha:
              <ul>
                {estado.erros.map((erro, i) => (
                  <li key={i}>{erro}</li>
                ))}
              </ul>
            </div>
          )}

          {resumo && <ResumoBar {...resumo} />}

          <h2>Resultado</h2>
          <ResultadoTabela resultados={estado.resultados} />
        </>
      )}

      <footer>
        Grade Tributária BA — motor de regras em <code>lib/rules.ts</code> e{" "}
        <code>lib/tables.ts</code>, isolado da interface para facilitar a inclusão de novas
        exceções por NCM.
      </footer>
    </main>
  );
}
