"use client";

import { useState } from "react";
import type { Empresa } from "@/lib/empresas";

interface TelaInstrucoesProps {
  empresa: Empresa;
  onComecar: (instrucoesTexto: string) => void;
  onVoltar: () => void;
}

export function TelaInstrucoes({ empresa, onComecar, onVoltar }: TelaInstrucoesProps) {
  const [texto, setTexto] = useState(empresa.instrucoesPersonalizadas);

  return (
    <div className="card">
      <h2 className="sem-margem-topo">Instruções para este processamento</h2>
      <p className="campo-ajuda">
        Pré-preenchido com as instruções salvas em <strong>{empresa.nome}</strong>. Edite à vontade —
        vale só para esta execução.
      </p>
      <div className="campo">
        <textarea
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ex.: "Considerar regime cumulativo de PIS/COFINS." / "Esta empresa não trabalha com cigarros — marcar como dúvida." / "Considerar redução de 60% para produtos de limpeza."'
        />
      </div>
      <div className="actions-row">
        <button type="button" onClick={() => onComecar(texto)}>
          Começar processamento
        </button>
        <button type="button" className="secondary" onClick={onVoltar}>
          Voltar
        </button>
      </div>
    </div>
  );
}
