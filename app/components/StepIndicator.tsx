interface StepIndicatorProps {
  etapas: string[];
  atual: number;
}

export function StepIndicator({ etapas, atual }: StepIndicatorProps) {
  return (
    <ol className="step-indicator" aria-label="Progresso">
      {etapas.map((rotulo, i) => {
        const numero = i + 1;
        const estado = numero < atual ? "concluida" : numero === atual ? "ativa" : "pendente";
        return (
          <li key={rotulo} className={`step step--${estado}`}>
            <span className="step-marcador" aria-hidden="true">
              {estado === "concluida" ? "✓" : numero}
            </span>
            <span className="step-rotulo">{rotulo}</span>
            {i < etapas.length - 1 && <span className="step-linha" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
