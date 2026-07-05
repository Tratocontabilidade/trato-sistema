const ETAPAS = [
  { numero: 1, rotulo: "Enviar planilha" },
  { numero: 2, rotulo: "Conferir classificação" },
  { numero: 3, rotulo: "Baixar arquivo" },
] as const;

interface StepIndicatorProps {
  atual: 1 | 2 | 3;
}

export function StepIndicator({ atual }: StepIndicatorProps) {
  return (
    <ol className="step-indicator" aria-label="Progresso">
      {ETAPAS.map((etapa, i) => {
        const estado = etapa.numero < atual ? "concluida" : etapa.numero === atual ? "ativa" : "pendente";
        return (
          <li key={etapa.numero} className={`step step--${estado}`}>
            <span className="step-marcador" aria-hidden="true">
              {estado === "concluida" ? "✓" : etapa.numero}
            </span>
            <span className="step-rotulo">{etapa.rotulo}</span>
            {i < ETAPAS.length - 1 && <span className="step-linha" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
