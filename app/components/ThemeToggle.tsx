"use client";

import { useEffect, useState } from "react";

type Tema = "light" | "dark";

function SolIcone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22" />
        <line x1="2" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="6.64" y2="6.64" />
        <line x1="17.36" y1="17.36" x2="19.07" y2="19.07" />
        <line x1="4.93" y1="19.07" x2="6.64" y2="17.36" />
        <line x1="17.36" y1="6.64" x2="19.07" y2="4.93" />
      </g>
    </svg>
  );
}

function LuaIcone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 119.5 4 6.8 6.8 0 0020 14.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "light" ? "light" : "dark");
  }, []);

  function alternar() {
    const novo: Tema = tema === "light" ? "dark" : "light";
    setTema(novo);
    document.documentElement.setAttribute("data-theme", novo);
    try {
      localStorage.setItem("theme", novo);
    } catch {
      // localStorage indisponível (ex.: navegação privada) — a escolha só vale para esta sessão.
    }
  }

  // Evita renderizar o ícone errado antes do useEffect confirmar o tema ativo.
  if (tema === null) {
    return <button type="button" className="theme-toggle" aria-hidden="true" tabIndex={-1} />;
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={alternar}
      aria-label={tema === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      title={tema === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {tema === "dark" ? <SolIcone /> : <LuaIcone />}
    </button>
  );
}
