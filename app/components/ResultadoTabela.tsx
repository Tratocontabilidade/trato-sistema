import type { Alerta, ProdutoResultado } from "@/lib/types";
import { Selo } from "./Selo";

function severidade(alerta: Alerta): "critico" | "atencao" {
  const chave = `${alerta.campo} ${alerta.mensagem}`.toLowerCase();
  if (chave.includes("simultaneamente") || chave.includes("conflito") || chave.includes("não possui uma variante")) {
    return "critico";
  }
  return "atencao";
}

function Codigo({ valor, descricao }: { valor: string; descricao: string }) {
  return (
    <span className="codigo-cel" title={descricao}>
      <Selo size={13} className="codigo-selo" />
      <span className="codigo-valor">{valor}</span>
    </span>
  );
}

interface ResultadoTabelaProps {
  resultados: ProdutoResultado[];
}

export function ResultadoTabela({ resultados }: ResultadoTabelaProps) {
  return (
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
          {resultados.map((r) => (
            <tr key={`${r.linha}-${r.codigo}`}>
              <td className="cel-mono">{r.codigo}</td>
              <td>{r.descricao}</td>
              <td className="cel-mono">
                <Codigo valor={r.ncm} descricao="NCM" />
              </td>
              <td className="cel-mono">
                <Codigo valor={r.cfop.codigo} descricao={r.cfop.descricao} />
              </td>
              <td className="cel-mono">{r.cstPis.codigo}</td>
              <td className="cel-mono">{r.cstCofins.codigo}</td>
              <td className="cel-mono">{r.cstIbsCbs.codigo}</td>
              <td className="cel-mono" title={`${r.cClassTrib.descricao} — ${r.cClassTrib.baseLegal}`}>
                {r.cClassTrib.codigo}
              </td>
              <td>
                {r.alertas.length > 0 ? (
                  <span className="badge badge--warn">revisar</span>
                ) : (
                  <span className="badge badge--ok">ok</span>
                )}
              </td>
              <td className="alertas-cel">
                {r.alertas.map((a, i) => (
                  <span key={i} className={`chip chip--${severidade(a)}`} title={a.norma}>
                    {a.mensagem}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
