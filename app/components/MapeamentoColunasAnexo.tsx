"use client";

import { useState } from "react";
import type { AnexoColunas } from "@/lib/empresas";

interface MapeamentoColunasAnexoProps {
  cabecalho: unknown[];
  onConfirmar: (colunas: AnexoColunas) => void;
  onCancelar: () => void;
}

export function MapeamentoColunasAnexo({ cabecalho, onConfirmar, onCancelar }: MapeamentoColunasAnexoProps) {
  const [ncm, setNcm] = useState("");
  const [descricao, setDescricao] = useState("");
  const [mva, setMva] = useState("");

  const opcoes = cabecalho.map((c, i) => ({ indice: i, rotulo: String(c ?? "").trim() || `Coluna ${i + 1}` }));

  return (
    <div className="anexo-mapeamento">
      <p className="campo-ajuda">
        Não conseguimos identificar as colunas automaticamente pelo cabeçalho. Selecione manualmente
        qual coluna é qual:
      </p>
      <div className="campo-grid">
        <div className="campo">
          <label htmlFor="mapeamento-ncm">Coluna do NCM</label>
          <select id="mapeamento-ncm" value={ncm} onChange={(e) => setNcm(e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map((o) => (
              <option key={o.indice} value={o.indice}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="mapeamento-descricao">Coluna da Descrição (opcional)</label>
          <select id="mapeamento-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)}>
            <option value="">(nenhuma)</option>
            {opcoes.map((o) => (
              <option key={o.indice} value={o.indice}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="mapeamento-mva">Coluna do MVA (opcional)</label>
          <select id="mapeamento-mva" value={mva} onChange={(e) => setMva(e.target.value)}>
            <option value="">(nenhuma)</option>
            {opcoes.map((o) => (
              <option key={o.indice} value={o.indice}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions-row">
        <button
          type="button"
          disabled={ncm === ""}
          onClick={() =>
            onConfirmar({
              ncm: Number(ncm),
              descricao: descricao === "" ? undefined : Number(descricao),
              mva: mva === "" ? undefined : Number(mva),
            })
          }
        >
          Confirmar
        </button>
        <button type="button" className="secondary" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
