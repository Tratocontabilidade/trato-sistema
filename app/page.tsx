"use client";

import { useMemo, useState } from "react";
import { classificarProdutosClienteAsync } from "@/lib/rules";
import { gerarPlanilhaClienteResultado, lerPlanilhaCliente, type PlanilhaClienteContexto } from "@/lib/excel";
import { interpretarInstrucoes, descreverDiretiva, type Diretiva } from "@/lib/instructions";
import { registrarProcessamento } from "@/lib/historico";
import type { ClientProdutoResultado, ContextoClassificacao } from "@/lib/types";
import type { Empresa } from "@/lib/empresas";
import { Selo } from "./components/Selo";
import { StepIndicator } from "./components/StepIndicator";
import { UploadArea } from "./components/UploadArea";
import { ResumoBar } from "./components/ResumoBar";
import { ResultadoTabela } from "./components/ResultadoTabela";
import { ProgressBar } from "./components/ProgressBar";
import { ThemeToggle } from "./components/ThemeToggle";
import { SeletorEmpresa } from "./components/SeletorEmpresa";
import { TelaInstrucoes } from "./components/TelaInstrucoes";

const ETAPAS = ["Empresa", "Instruções", "Enviar planilha", "Conferir classificação", "Baixar arquivo"];

type Estado =
  | { fase: "empresa" }
  | { fase: "instrucoes"; empresa: Empresa }
  | { fase: "upload"; empresa: Empresa; instrucoesTexto: string }
  | { fase: "processando"; empresa: Empresa; instrucoesTexto: string; processados: number; total: number }
  | { fase: "erro"; mensagem: string; empresa: Empresa; instrucoesTexto: string }
  | {
      fase: "pronto";
      empresa: Empresa;
      instrucoesTexto: string;
      resultados: ClientProdutoResultado[];
      erros: string[];
      contexto: PlanilhaClienteContexto;
      nomeArquivo: string;
      naoReconhecidas: string[];
    };

function etapaAtual(estado: Estado): number {
  switch (estado.fase) {
    case "empresa":
      return 1;
    case "instrucoes":
      return 2;
    case "upload":
    case "erro":
      return 3;
    case "processando":
      return 4;
    case "pronto":
      return 5;
  }
}

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ fase: "empresa" });

  const resumo = useMemo(() => {
    if (estado.fase !== "pronto") return null;
    const total = estado.resultados.length;
    let ok = 0;
    let preenchidos = 0;
    let revisar = 0;
    let divergentes = 0;
    let duvidas = 0;
    for (const r of estado.resultados) {
      if (r.status === "OK") ok++;
      else if (r.status === "Preenchido automaticamente") preenchidos++;
      else if (r.status === "Revisar manualmente") revisar++;
      else if (r.status === "Divergência detectada") divergentes++;
      else if (r.status === "Dúvida — aguardando instrução") duvidas++;
    }
    return { total, ok, preenchidos, revisar, divergentes, duvidas };
  }, [estado]);

  async function processarArquivo(arquivo: File) {
    if (estado.fase !== "upload" && estado.fase !== "erro") return;
    const { empresa, instrucoesTexto } = estado;

    setEstado({ fase: "processando", empresa, instrucoesTexto, processados: 0, total: 0 });
    try {
      const buffer = await arquivo.arrayBuffer();
      const { produtos, erros, contexto } = lerPlanilhaCliente(buffer);

      if (!contexto) {
        setEstado({ fase: "erro", mensagem: erros.join(" "), empresa, instrucoesTexto });
        return;
      }

      const { diretivas, naoReconhecidas } = interpretarInstrucoes(instrucoesTexto);
      const diretivaRegime = diretivas.find(
        (d): d is Extract<Diretiva, { tipo: "regime" }> => d.tipo === "regime"
      );
      const regimeDaEmpresa = empresa.regimeTributario === "Lucro Real" ? "nao_cumulativo" : "cumulativo";
      const anexosAtivos = empresa.anexos.filter((a) => a.ativo);
      const contextoClassificacao: ContextoClassificacao = {
        regime: diretivaRegime?.regime ?? regimeDaEmpresa,
        diretivas,
        anexosAtivos,
        regrasAprendidas: empresa.regrasAprendidas,
      };

      setEstado({ fase: "processando", empresa, instrucoesTexto, processados: 0, total: produtos.length });
      const resultados = await classificarProdutosClienteAsync(produtos, {
        contexto: contextoClassificacao,
        onProgresso: ({ processados, total }) =>
          setEstado({ fase: "processando", empresa, instrucoesTexto, processados, total }),
      });

      let ok = 0;
      let preenchidos = 0;
      let revisar = 0;
      let divergentes = 0;
      let duvidas = 0;
      for (const r of resultados) {
        if (r.status === "OK") ok++;
        else if (r.status === "Preenchido automaticamente") preenchidos++;
        else if (r.status === "Revisar manualmente") revisar++;
        else if (r.status === "Divergência detectada") divergentes++;
        else if (r.status === "Dúvida — aguardando instrução") duvidas++;
      }
      registrarProcessamento({
        empresaId: empresa.id,
        nomeArquivo: arquivo.name,
        instrucoesAplicadas: diretivas.map(descreverDiretiva),
        anexosAtivos: anexosAtivos.map((a) => a.nome),
        contadores: { total: resultados.length, ok, preenchidos, revisar, divergentes, duvidas },
        resultados,
        contexto,
      });

      setEstado({
        fase: "pronto",
        empresa,
        instrucoesTexto,
        resultados,
        erros,
        contexto,
        nomeArquivo: arquivo.name,
        naoReconhecidas,
      });
    } catch (e) {
      setEstado({
        fase: "erro",
        mensagem: e instanceof Error ? e.message : "Falha desconhecida ao ler a planilha.",
        empresa,
        instrucoesTexto,
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

  function novaPlanilha() {
    if (estado.fase === "pronto" || estado.fase === "erro") {
      setEstado({ fase: "upload", empresa: estado.empresa, instrucoesTexto: estado.instrucoesTexto });
    }
  }

  function trocarEmpresa() {
    setEstado({ fase: "empresa" });
  }

  return (
    <main>
      <div className="app-header">
        <Selo size={32} className="app-header-selo" title="Grade Tributária BA" />
        <h1>Grade Tributária BA</h1>
        <ThemeToggle />
      </div>
      <p className="subtitle">
        Classificação fiscal do "Cadastro de Produtos" para supermercados na Bahia — preenche
        automaticamente CFOP, CST, PIS/COFINS e CST/cClassTrib de IBS/CBS, e valida os campos já
        preenchidos.
      </p>

      <StepIndicator etapas={ETAPAS} atual={etapaAtual(estado)} />

      <div className="disclaimer">
        Este sistema apoia o trabalho do analista fiscal, mas <strong>não substitui a revisão
        técnica</strong> antes da emissão de documentos fiscais. Linhas com status diferente de "OK"
        exigem confirmação humana antes do uso — inclusive "Dúvida — aguardando instrução", que nunca
        deve ser preenchida por chute. A tabela de cClassTrib do IBS/CBS muda com frequência —
        confirme sempre a versão vigente do Informe Técnico NF-e no{" "}
        <a className="link" href="https://www.nfe.fazenda.gov.br" target="_blank" rel="noreferrer">
          Portal Nacional da NF-e
        </a>
        .
      </div>

      {estado.fase !== "empresa" && estado.fase !== "instrucoes" && (
        <div className="actions-row" style={{ marginBottom: 16 }}>
          <button type="button" className="secondary" onClick={trocarEmpresa}>
            Trocar empresa ({estado.empresa.nome})
          </button>
        </div>
      )}

      {estado.fase === "empresa" && (
        <div className="card">
          <h2 className="sem-margem-topo">Escolha a empresa</h2>
          <SeletorEmpresa empresaId={null} onSelecionar={(empresa) => setEstado({ fase: "instrucoes", empresa })} />
        </div>
      )}

      {estado.fase === "instrucoes" && (
        <TelaInstrucoes
          empresa={estado.empresa}
          onComecar={(instrucoesTexto) => setEstado({ fase: "upload", empresa: estado.empresa, instrucoesTexto })}
          onVoltar={() => setEstado({ fase: "empresa" })}
        />
      )}

      {(estado.fase === "upload" || estado.fase === "processando" || estado.fase === "erro") && (
        <div className="card">
          <UploadArea onFile={processarArquivo} disabled={estado.fase === "processando"} />

          <div className="actions-row">
            <a className="link" href="/planilha-modelo.xlsx" download style={{ marginLeft: "auto" }}>
              Baixar planilha-modelo
            </a>
          </div>

          {estado.fase === "processando" && <ProgressBar processados={estado.processados} total={estado.total} />}

          {estado.fase === "erro" && (
            <div className="erros">Erro ao processar a planilha: {estado.mensagem}</div>
          )}
        </div>
      )}

      {estado.fase === "pronto" && (
        <>
          <div className="actions-row">
            <button onClick={baixarResultado}>Baixar planilha classificada</button>
            <button className="secondary" onClick={novaPlanilha}>
              Nova planilha
            </button>
          </div>

          {estado.naoReconhecidas.length > 0 && (
            <div className="disclaimer">
              As seguintes instruções não foram aplicadas automaticamente: "
              {estado.naoReconhecidas.join('"; "')}". Considere revisar manualmente.
            </div>
          )}

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
