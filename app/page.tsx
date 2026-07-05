"use client";

import { useMemo, useRef, useState } from "react";
import { classificarProdutos } from "@/lib/rules";
import { gerarPlanilhaResultado, lerPlanilhaProdutos } from "@/lib/excel";
import type { ProdutoResultado } from "@/lib/types";

type Estado =
  | { fase: "vazio" }
  | { fase: "processando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; resultados: ProdutoResultado[]; erros: string[]; nomeArquivo: string };

export default function Page() {
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main>
      <h1>Grade Tributária BA</h1>
      <p className="subtitle">
        Classificação de CFOP, CST de PIS/COFINS e CST/cClassTrib de IBS/CBS para revenda
        estabelecida na Bahia (Lucro Real/Presumido).
      </p>

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

      <div className="card">
        <div className="upload-row">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={estado.fase === "processando"}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) processarArquivo(arquivo);
            }}
          />
          {estado.fase === "processando" && <span>Processando…</span>}
          {estado.fase === "pronto" && (
            <>
              <button onClick={baixarResultado}>Baixar resultado (.xlsx)</button>
              <button className="secondary" onClick={limpar}>
                Nova planilha
              </button>
            </>
          )}
          <a className="link" href="/planilha-modelo.xlsx" download style={{ marginLeft: "auto" }}>
            Baixar planilha-modelo
          </a>
        </div>

        {estado.fase === "erro" && (
          <div className="erros">Erro ao processar a planilha: {estado.mensagem}</div>
        )}

        {estado.fase === "pronto" && estado.erros.length > 0 && (
          <div className="erros">
            {estado.erros.length} linha(s) não puderam ser classificadas e foram ignoradas:
            <ul>
              {estado.erros.map((erro, i) => (
                <li key={i}>{erro}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {estado.fase === "pronto" && (
        <>
          <div className="resumo">
            <div className="item">
              <div className="valor">{resumo?.total}</div>
              <div className="rotulo">Produtos classificados</div>
            </div>
            <div className="item">
              <div className="valor">{resumo?.semAlerta}</div>
              <div className="rotulo">Sem alerta</div>
            </div>
            <div className="item">
              <div className="valor">{resumo?.comAlerta}</div>
              <div className="rotulo">Com alerta (revisar)</div>
            </div>
          </div>

          <h2>Resultado</h2>
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>NCM</th>
                  <th>CFOP</th>
                  <th>CST PIS</th>
                  <th>CST COFINS</th>
                  <th>CST IBS/CBS</th>
                  <th>cClassTrib</th>
                  <th>Status</th>
                  <th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {estado.resultados.map((r) => (
                  <tr key={`${r.linha}-${r.codigo}`} className={r.alertas.length > 0 ? "linha-com-alerta" : ""}>
                    <td>{r.codigo}</td>
                    <td>{r.descricao}</td>
                    <td>{r.ncm}</td>
                    <td title={r.cfop.descricao}>{r.cfop.codigo}</td>
                    <td title={r.cstPis.descricao}>{r.cstPis.codigo}</td>
                    <td title={r.cstCofins.descricao}>{r.cstCofins.codigo}</td>
                    <td title={r.cstIbsCbs.descricao}>{r.cstIbsCbs.codigo}</td>
                    <td title={`${r.cClassTrib.descricao} — ${r.cClassTrib.baseLegal}`}>
                      {r.cClassTrib.codigo}
                    </td>
                    <td>
                      {r.alertas.length > 0 ? (
                        <span className="badge warn">revisar</span>
                      ) : (
                        <span className="badge ok">ok</span>
                      )}
                    </td>
                    <td className="alertas-cel">
                      {r.alertas.map((a, i) => (
                        <div key={i}>
                          [{a.campo}] {a.mensagem} ({a.norma})
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
