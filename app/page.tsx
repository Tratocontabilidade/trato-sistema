"use client";

import { useMemo, useState } from "react";
import { classificarProdutos } from "@/lib/rules";
import { gerarPlanilhaResultado, lerPlanilhaProdutos } from "@/lib/excel";
import type { ProdutoResultado } from "@/lib/types";
import { Selo } from "./components/Selo";
import { StepIndicator } from "./components/StepIndicator";
import { UploadArea } from "./components/UploadArea";
import { ResumoBar } from "./components/ResumoBar";
import { ResultadoTabela } from "./components/ResultadoTabela";
import { ThemeToggle } from "./components/ThemeToggle";

type Estado =
  | { fase: "vazio" }
  | { fase: "processando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; resultados: ProdutoResultado[]; erros: string[]; nomeArquivo: string };

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
    const comAlerta = estado.resultados.filter((r) => r.alertas.length > 0).length;
    return { total, comAlerta, semAlerta: total - comAlerta };
  }, [estado]);

  async function processarArquivo(arquivo: File) {
    setEstado({ fase: "processando" });
    try {
      const buffer = await arquivo.arrayBuffer();
      const { produtos, erros } = lerPlanilhaProdutos(buffer);
      const resultados = classificarProdutos(produtos);
      setEstado({ fase: "pronto", resultados, erros, nomeArquivo: arquivo.name });
    } catch (e) {
      setEstado({
        fase: "erro",
        mensagem: e instanceof Error ? e.message : "Falha desconhecida ao ler a planilha.",
      });
    }
  }

  function baixarResultado() {
    if (estado.fase !== "pronto") return;
    const bytes = gerarPlanilhaResultado(estado.resultados);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grade-tributaria-${estado.nomeArquivo.replace(/\.xlsx?$/i, "")}.xlsx`;
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
        Classificação de CFOP, CST de PIS/COFINS e CST/cClassTrib de IBS/CBS para revenda
        estabelecida na Bahia (Lucro Real/Presumido).
      </p>

      <StepIndicator atual={etapaAtual(estado)} />

      <div className="disclaimer">
        Este sistema apoia o trabalho do analista fiscal, mas <strong>não substitui a revisão
        técnica</strong> antes da emissão de documentos fiscais. As classificações marcadas com
        alerta exigem confirmação humana. A tabela de cClassTrib do IBS/CBS muda com frequência —
        confirme sempre a versão vigente do Informe Técnico NF-e no{" "}
        <a
          className="link"
          href="https://www.nfe.fazenda.gov.br"
          target="_blank"
          rel="noreferrer"
        >
          Portal Nacional da NF-e
        </a>
        .
      </div>

      {estado.fase !== "pronto" && (
        <div className="card">
          <UploadArea onFile={processarArquivo} disabled={estado.fase === "processando"} />

          <div className="actions-row">
            {estado.fase === "processando" && (
              <span className="processando">
                <span className="spinner" aria-hidden="true" />
                Classificando produtos…
              </span>
            )}
            <a className="link" href="/planilha-modelo.xlsx" download style={{ marginLeft: "auto" }}>
              Baixar planilha-modelo
            </a>
          </div>

          {estado.fase === "erro" && (
            <div className="erros">Erro ao processar a planilha: {estado.mensagem}</div>
          )}
        </div>
      )}

      {estado.fase === "pronto" && (
        <>
          <div className="actions-row">
            <button onClick={baixarResultado}>Baixar resultado (.xlsx)</button>
            <button className="secondary" onClick={limpar}>
              Nova planilha
            </button>
          </div>

          {estado.erros.length > 0 && (
            <div className="erros">
              {estado.erros.length} linha(s) não puderam ser classificadas e foram ignoradas:
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
