"use client";

import { useEffect, useState } from "react";
import { listarEmpresas, removerEmpresa, type Empresa } from "@/lib/empresas";
import { EmpresaForm } from "../components/EmpresaForm";
import { Selo } from "../components/Selo";
import { ThemeToggle } from "../components/ThemeToggle";

type Modo = { tipo: "lista" } | { tipo: "criar" } | { tipo: "editar"; empresa: Empresa };

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [modo, setModo] = useState<Modo>({ tipo: "lista" });

  useEffect(() => {
    setEmpresas(listarEmpresas());
  }, []);

  function recarregar() {
    setEmpresas(listarEmpresas());
    setModo({ tipo: "lista" });
  }

  function handleExcluir(id: string) {
    if (!confirm("Excluir esta empresa? Isso remove também os anexos e regras aprendidas dela.")) return;
    removerEmpresa(id);
    setEmpresas(listarEmpresas());
  }

  return (
    <main>
      <div className="app-header">
        <Selo size={32} className="app-header-selo" title="Grade Tributária BA" />
        <h1>Empresas</h1>
        <ThemeToggle />
      </div>
      <p className="subtitle">
        Cadastro de clientes do escritório — cada empresa guarda suas próprias instruções, anexos de
        ST e regras aprendidas com correções.
      </p>

      {modo.tipo === "lista" && (
        <>
          <div className="actions-row">
            <button onClick={() => setModo({ tipo: "criar" })}>+ Nova empresa</button>
          </div>

          {empresas.length === 0 ? (
            <div className="card">Nenhuma empresa cadastrada ainda.</div>
          ) : (
            <div className="lista-empresas">
              {empresas.map((emp) => (
                <div key={emp.id} className="card empresa-card">
                  <div>
                    <strong>{emp.nome}</strong>
                    <div className="empresa-card-meta">
                      {emp.ramo} · {emp.uf} · {emp.regimeTributario}
                      {emp.cnpj && ` · ${emp.cnpj}`}
                    </div>
                    <div className="empresa-card-meta">
                      {emp.anexos.length} anexo(s) · {emp.regrasAprendidas.length} regra(s) aprendida(s)
                    </div>
                  </div>
                  <div className="actions-row">
                    <button className="secondary" onClick={() => setModo({ tipo: "editar", empresa: emp })}>
                      Editar
                    </button>
                    <button className="secondary" onClick={() => handleExcluir(emp.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modo.tipo === "criar" && (
        <div className="card">
          <h2 className="sem-margem-topo">Nova empresa</h2>
          <EmpresaForm onSalvar={recarregar} onCancelar={() => setModo({ tipo: "lista" })} />
        </div>
      )}

      {modo.tipo === "editar" && (
        <div className="card">
          <h2 className="sem-margem-topo">Editar empresa</h2>
          <EmpresaForm empresa={modo.empresa} onSalvar={recarregar} onCancelar={() => setModo({ tipo: "lista" })} />
        </div>
      )}
    </main>
  );
}
