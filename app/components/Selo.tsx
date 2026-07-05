// Selo circular minimalista — usado como marca do sistema, ícone de código
// classificado na tabela e motivo visual do estado vazio. Estilo carimbo
// fiscal em linha fina, sem preenchimento nem gradiente.

interface SeloProps {
  size?: number;
  className?: string;
  title?: string;
}

export function Selo({ size = 24, className, title }: SeloProps) {
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * 360) / 16;
    return angle;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="21.5" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      {ticks.map((angle) => (
        <line
          key={angle}
          x1="24"
          y1="4.5"
          x2="24"
          y2="7"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.7"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
      <path
        d="M17 24.5l4.5 4.5L31.5 18.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}
