interface ProgressBarProps {
  processados: number;
  total: number;
}

export function ProgressBar({ processados, total }: ProgressBarProps) {
  const percentual = total > 0 ? Math.min(100, Math.round((processados / total) * 100)) : 0;

  return (
    <div className="progresso" role="status">
      <div className="progresso-barra">
        <div className="progresso-preenchimento" style={{ width: `${percentual}%` }} />
      </div>
      <span className="progresso-texto">
        Classificando… {processados.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} ({percentual}%)
      </span>
    </div>
  );
}
