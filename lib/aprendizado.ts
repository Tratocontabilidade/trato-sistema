// Compara um resultado anterior (do histórico) com uma planilha corrigida
// manualmente, produzindo divergências por NCM+campo para revisão humana.
// Nunca aplica nada sozinho — a interface (RevisaoAprendizado.tsx) exige
// aprovação explícita antes de qualquer divergência virar regra salva na
// empresa (lib/empresas.ts, RegraAprendida).

import type { ClientProdutoEntrada, ClientProdutoResultado } from "./types";

export interface DivergenciaAprendizado {
  ncm: string;
  nome: string;
  campo: string;
  rotuloCampo: string;
  valorAnterior: string;
  valorNovo: string;
}

// cfopSaidas e cstIcms (as duas colunas que decidem ST) ficam de fora de
// propósito — o motor (lib/rules.ts) nunca aceita regra aprendida para esses
// dois campos, então oferecer aqui a opção de "aprender" uma correção neles
// criaria uma regra que o motor descartaria sempre, além de abrir espaço
// para um clique errado ("Aprovar todas do mesmo NCM") travar um NCM em
// ST/não-ST por fora do anexo vigente. ST é sempre responsabilidade do
// anexo ativo da empresa (lib/anexos.ts) — para corrigir, atualize o anexo.
const CAMPOS_COMPARAVEIS: { campo: keyof ClientProdutoResultado; rotulo: string }[] = [
  { campo: "cstPisCofins", rotulo: "CST PIS/COFINS" },
  { campo: "pis", rotulo: "PIS" },
  { campo: "cofins", rotulo: "COFINS" },
  { campo: "natReceita", rotulo: "NAT. RECEITA" },
  { campo: "cstIbsCbs", rotulo: "CST IBS/CBS" },
  { campo: "cclasstrib", rotulo: "Cclasstrib" },
  { campo: "redBc", rotulo: "RED. B.C." },
];

// Dígitos esperados por campo de código — mesmas larguras de lib/rules.ts.
// Usado só para NORMALIZAR a comparação (ex.: "40" e "040" são o mesmo
// valor); o resultado exibido ao usuário já sai no formato normalizado.
const DIGITOS_ESPERADOS: Partial<Record<string, number>> = {
  cstPisCofins: 2,
  cstIbsCbs: 3,
  cclasstrib: 6,
};
const CAMPOS_NUMERICOS = new Set(["pis", "cofins", "redBc"]);

function normalizarValorComparavel(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "";

  const digitos = DIGITOS_ESPERADOS[campo];
  if (digitos) {
    const soDigitos = String(valor).replace(/\D/g, "");
    return soDigitos ? soDigitos.padStart(digitos, "0") : String(valor).trim();
  }

  if (CAMPOS_NUMERICOS.has(campo)) {
    const n = Number(String(valor).trim().replace(",", "."));
    return Number.isFinite(n) ? String(n) : String(valor).trim();
  }

  return String(valor).trim();
}

/** Casa linhas pelo Código do produto — assume que o código não muda entre a execução original e a corrigida. */
export function compararResultados(
  original: ClientProdutoResultado[],
  corrigido: ClientProdutoEntrada[]
): DivergenciaAprendizado[] {
  const porCodigo = new Map<string, ClientProdutoResultado>();
  for (const r of original) porCodigo.set(String(r.codigo).trim(), r);

  const divergencias: DivergenciaAprendizado[] = [];
  for (const linhaCorrigida of corrigido) {
    const anterior = porCodigo.get(String(linhaCorrigida.codigo).trim());
    if (!anterior) continue;
    if (anterior.ncm.length !== 8) continue; // sem NCM confiável, não vira regra

    for (const { campo, rotulo } of CAMPOS_COMPARAVEIS) {
      const valorAnterior = normalizarValorComparavel(campo, anterior[campo]);
      const valorNovo = normalizarValorComparavel(
        campo,
        (linhaCorrigida as unknown as Record<string, unknown>)[campo]
      );
      if (valorNovo !== "" && valorNovo !== valorAnterior) {
        divergencias.push({
          ncm: anterior.ncm,
          nome: String(anterior.nome),
          campo,
          rotuloCampo: rotulo,
          valorAnterior,
          valorNovo,
        });
      }
    }
  }
  return divergencias;
}
