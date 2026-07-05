"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Selo } from "./Selo";

const ITENS = [
  { href: "/", rotulo: "Processar planilha" },
  { href: "/empresas", rotulo: "Empresas" },
  { href: "/historico", rotulo: "Histórico" },
  { href: "/aprender", rotulo: "Aprender com correção" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="nav-bar">
      <div className="nav-bar-inner">
        <Link href="/" className="nav-brand">
          <Selo size={22} />
          <span>Grade Tributária BA</span>
        </Link>
        <div className="nav-links">
          {ITENS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${pathname === item.href ? " nav-link--ativo" : ""}`}
            >
              {item.rotulo}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
