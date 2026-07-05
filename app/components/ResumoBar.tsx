interface ResumoBarProps {
  total: number;
  ok: number;
  preenchidos: number;
  revisar: number;
  divergentes: number;
  duvidas: number;
}

export function ResumoBar({ total, ok, preenchidos, revisar, divergentes, duvidas }: ResumoBarProps) {
  return (
    <div className="resumo" role="status">
      <div className="resumo-item">
        <div className="resumo-valor">{total.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Total de produtos</div>
      </div>
      <div className="resumo-item resumo-item--ok">
        <div className="resumo-valor">{ok.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Já classificados pelo cliente</div>
      </div>
      <div className="resumo-item resumo-item--ok">
        <div className="resumo-valor">{preenchidos.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Preenchidos automaticamente</div>
      </div>
      <div className="resumo-item resumo-item--warn">
        <div className="resumo-valor">{revisar.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Precisam revisão manual</div>
      </div>
      <div className="resumo-item resumo-item--danger">
        <div className="resumo-valor">{divergentes.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Com divergência</div>
      </div>
      <div className="resumo-item resumo-item--duvida">
        <div className="resumo-valor">{duvidas.toLocaleString("pt-BR")}</div>
        <div className="resumo-rotulo">Dúvida — aguardando instrução</div>
      </div>
    </div>
  );
}
