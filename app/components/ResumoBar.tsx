interface ResumoBarProps {
  total: number;
  semAlerta: number;
  comAlerta: number;
}

export function ResumoBar({ total, semAlerta, comAlerta }: ResumoBarProps) {
  return (
    <div className="resumo" role="status">
      <div className="resumo-item">
        <div className="resumo-valor">{total}</div>
        <div className="resumo-rotulo">Produtos classificados</div>
      </div>
      <div className="resumo-item resumo-item--ok">
        <div className="resumo-valor">{semAlerta}</div>
        <div className="resumo-rotulo">Sem alerta</div>
      </div>
      <div className="resumo-item resumo-item--warn">
        <div className="resumo-valor">{comAlerta}</div>
        <div className="resumo-rotulo">Com alerta (revisar)</div>
      </div>
    </div>
  );
}
