import type { DivergenciaAprendizado } from "@/lib/aprendizado";

export interface ItemRevisao extends DivergenciaAprendizado {
  status: "pendente" | "aprovada" | "descartada";
}

interface RevisaoAprendizadoProps {
  itens: ItemRevisao[];
  onAprovar: (indice: number) => void;
  onDescartar: (indice: number) => void;
  onAprovarTodasDoNcm: (ncm: string) => void;
}

export function RevisaoAprendizado({ itens, onAprovar, onDescartar, onAprovarTodasDoNcm }: RevisaoAprendizadoProps) {
  return (
    <div className="lista-divergencias">
      {itens.map((item, i) => (
        <div key={i} className="divergencia-item">
          <div>
            <strong>NCM {item.ncm}</strong> — {item.nome}
            <div className="campo-ajuda">
              {item.rotuloCampo}: "{item.valorAnterior || "(vazio)"}" → "{item.valorNovo}"
            </div>
          </div>
          {item.status === "pendente" ? (
            <div className="actions-row">
              <button type="button" onClick={() => onAprovar(i)}>
                Aprovar
              </button>
              <button type="button" className="secondary" onClick={() => onDescartar(i)}>
                Descartar
              </button>
              <button type="button" className="secondary" onClick={() => onAprovarTodasDoNcm(item.ncm)}>
                Aprovar todas do NCM
              </button>
            </div>
          ) : (
            <span className={`badge ${item.status === "aprovada" ? "badge--ok" : "badge--danger"}`}>
              {item.status === "aprovada" ? "Aprovada" : "Descartada"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
