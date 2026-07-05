"use client";

import { useEffect, useState } from "react";
import { listarEmpresas, type Empresa } from "@/lib/empresas";
import { EmpresaForm } from "./EmpresaForm";

interface SeletorEmpresaProps {
  empresaId: string | null;
  onSelecionar: (empresa: Empresa) => void;
}

export function SeletorEmpresa({ empresaId, onSelecionar }: SeletorEmpresaProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [criandoNova, setCriandoNova] = useState(false);

  useEffect(() => {
    setEmpresas(listarEmpresas());
  }, []);

  function handleNovaEmpresa(empresa: Empresa) {
    setEmpresas((atual) => [...atual, empresa]);
    setCriandoNova(false);
    onSelecionar(empresa);
  }

  if (criandoNova) {
    return (
      <div className="card">
        <h2 className="sem-margem-topo">Nova empresa</h2>
        <EmpresaForm onSalvar={handleNovaEmpresa} onCancelar={() => setCriandoNova(false)} />
      </div>
    );
  }

  return (
    <div className="seletor-empresa">
      <select
        value={empresaId ?? ""}
        onChange={(e) => {
          const selecionada = empresas.find((emp) => emp.id === e.target.value);
          if (selecionada) onSelecionar(selecionada);
        }}
      >
        <option value="" disabled>
          Selecione uma empresa…
        </option>
        {empresas.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.nome} ({emp.uf})
          </option>
        ))}
      </select>
      <button type="button" className="secondary" onClick={() => setCriandoNova(true)}>
        + Nova empresa
      </button>
    </div>
  );
}
