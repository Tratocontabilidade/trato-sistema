"use client";

import { useMemo, useState } from "react";
import type { ClientProdutoResultado, StatusLinha } from "@/lib/types";

const TAMANHO_PAGINA = 100;

const STATUS_FILTROS: { valor: StatusLinha | "todos"; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "OK", rotulo: "OK" },
  { valor: "Preenchido automaticamente", rotulo: "Preenchido automaticamente" },
  { valor: "Divergência detectada", rotulo: "Divergência detectada" },
  { valor: "Revisar manualmente", rotulo: "Revisar manualmente" },
  { valor: "Dúvida — aguardando instrução", rotulo: "Dúvida — aguardando instrução" },
];

function classeBadgeStatus(status: StatusLinha): string {
  switch (status) {
    case "OK":
      return "badge--ok";
    case "Preenchido automaticamente":
      return "badge--info";
    case "Divergência detectada":
      return "badge--danger";
    case "Revisar manualmente":
      return "badge--warn";
    case "Dúvida — aguardando instrução":
      return "badge--duvida";
  }
}

const COLUNAS: { rotulo: string; mono?: boolean; render: (r: ClientProdutoResultado) => React.ReactNode }[] = [
  { rotulo: "Código", render: (r) => r.codigo },
  { rotulo: "Nome", render: (r) => r.nome },
  { rotulo: "Tributação", render: (r) => r.tributacao },
  { rotulo: "NCM", mono: true, render: (r) => r.ncmOriginal },
  { rotulo: "CFOP SAIDAS", mono: true, render: (r) => r.cfopSaidas },
  { rotulo: "CST ICMS", mono: true, render: (r) => r.cstIcms },
  { rotulo: "CST PIS/COFINS", mono: true, render: (r) => r.cstPisCofins },
  { rotulo: "PIS", mono: true, render: (r) => r.pis ?? "" },
  { rotulo: "COFINS", mono: true, render: (r) => r.cofins ?? "" },
  { rotulo: "NAT. RECEITA", mono: true, render: (r) => r.natReceita },
  { rotulo: "CST IBS/CBS", mono: true, render: (r) => r.cstIbsCbs },
  { rotulo: "Cclasstrib", mono: true, render: (r) => r.cclasstrib },
  { rotulo: "RED. B.C.", mono: true, render: (r) => r.redBc ?? "" },
  { rotulo: "IBS", mono: true, render: (r) => r.ibs ?? "" },
  { rotulo: "CBS", mono: true, render: (r) => r.cbs ?? "" },
];

interface ResultadoTabelaProps {
  resultados: ClientProdutoResultado[];
}

export function ResultadoTabela({ resultados }: ResultadoTabelaProps) {
  const [filtro, setFiltro] = useState<StatusLinha | "todos">("todos");
  const [pagina, setPagina] = useState(1);

  const contagens = useMemo(() => {
    const c: Record<string, number> = { todos: resultados.length };
    for (const r of resultados) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [resultados]);

  const filtrados = useMemo(
    () => (filtro === "todos" ? resultados : resultados.filter((r) => r.status === filtro)),
    [resultados, filtro]
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
  const paginaValida = Math.min(pagina, totalPaginas);
  const pagina0 = paginaValida - 1;
  const visiveis = filtrados.slice(pagina0 * TAMANHO_PAGINA, pagina0 * TAMANHO_PAGINA + TAMANHO_PAGINA);

  function selecionarFiltro(v: StatusLinha | "todos") {
    setFiltro(v);
    setPagina(1);
  }

  return (
    <div>
      <div className="filtro-status">
        {STATUS_FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            className={`chip-filtro${filtro === f.valor ? " chip-filtro--ativo" : ""}`}
            onClick={() => selecionarFiltro(f.valor)}
          >
            {f.rotulo} ({(contagens[f.valor] ?? 0).toLocaleString("pt-BR")})
          </button>
        ))}
      </div>

      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              {COLUNAS.map((c) => (
                <th key={c.rotulo}>{c.rotulo}</th>
              ))}
              <th>Status</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => (
              <tr key={r.linha}>
                {COLUNAS.map((c) => (
                  <td key={c.rotulo} className={c.mono ? "cel-mono" : undefined}>
                    {c.render(r)}
                  </td>
                ))}
                <td>
                  <span className={`badge ${classeBadgeStatus(r.status)}`}>{r.status}</span>
                </td>
                <td className="alertas-cel">{r.observacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="paginacao">
          <button
            type="button"
            className="secondary"
            disabled={paginaValida <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span>
            Página {paginaValida} de {totalPaginas} ({filtrados.length.toLocaleString("pt-BR")} linhas)
          </span>
          <button
            type="button"
            className="secondary"
            disabled={paginaValida >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
