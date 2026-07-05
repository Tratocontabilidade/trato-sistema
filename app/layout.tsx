import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grade Tributária BA",
  description:
    "Classificação de CFOP, CST de PIS/COFINS e CST/cClassTrib de IBS/CBS para revenda na Bahia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
