// Interpretação de instruções em português livre para o processamento.
//
// V1 sem IA externa: casamento por palavra-chave/regex, sentença a
// sentença. O que não for reconhecido aparece em `naoReconhecidas` para o
// usuário revisar manualmente — nunca aplicamos um comando que não
// entendemos com confiança (mesma "regra de ouro" do motor de rules.ts).

function normalizarChaveTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type Diretiva =
  | { tipo: "regime"; regime: "cumulativo" | "nao_cumulativo" }
  | { tipo: "excluir_segmento"; chave: string; rotulo: string }
  | { tipo: "forcar_padrao"; padrao: "tributado" | "isento" | "st" }
  | { tipo: "reducao_segmento"; chave: string; rotulo: string; percentual: number };

export interface ResultadoInterpretacao {
  diretivas: Diretiva[];
  naoReconhecidas: string[];
}

interface SegmentoDef {
  chave: string;
  rotulo: string;
  /** Palavras-chave (já normalizadas) procuradas no campo Nome do produto. */
  palavrasChave: string[];
}

/**
 * Dicionário de segmentos usado tanto para interpretar instruções ("não
 * trabalha com X") quanto para casar produtos pelo Nome (não há coluna de
 * segmento na planilha do cliente). É heurístico por natureza — ver
 * README, seção de limitações conhecidas. Listar rótulos mais específicos
 * antes dos mais genéricos, pois o casamento usa a primeira ocorrência.
 */
export const SEGMENTOS: SegmentoDef[] = [
  {
    chave: "bebidas_alcoolicas",
    rotulo: "bebidas alcoólicas",
    palavrasChave: ["cerveja", "vinho", "whisky", "whiskey", "vodka", "cachaca", "gin", "licor", "espumante", "aguardente"],
  },
  {
    chave: "cigarros",
    rotulo: "cigarros/tabaco",
    palavrasChave: ["cigarro", "tabaco", "charuto"],
  },
  {
    chave: "bebidas",
    rotulo: "bebidas",
    palavrasChave: ["refrigerante", "suco", "agua mineral", "energetico", "isotonico", "cerveja", "vinho"],
  },
  {
    chave: "cosmeticos",
    rotulo: "cosméticos",
    palavrasChave: ["shampoo", "xampu", "condicionador", "creme", "perfume", "desodorante", "maquiagem", "hidratante"],
  },
  {
    chave: "limpeza",
    rotulo: "produtos de limpeza",
    palavrasChave: ["detergente", "sabao em po", "desinfetante", "agua sanitaria", "amaciante", "alvejante"],
  },
  {
    chave: "sorvetes",
    rotulo: "sorvetes",
    palavrasChave: ["sorvete", "picole", "acai"],
  },
  {
    chave: "laticinios",
    rotulo: "laticínios",
    palavrasChave: ["leite", "queijo", "iogurte", "manteiga", "requeijao"],
  },
  {
    chave: "carnes",
    rotulo: "carnes",
    palavrasChave: ["carne", "frango", "peixe", "linguica", "salsicha", "bacon", "file"],
  },
  {
    chave: "hortifruti",
    rotulo: "hortifrúti",
    palavrasChave: ["fruta", "legume", "verdura", "hortalica"],
  },
];

function identificarSegmento(textoBusca: string): SegmentoDef | undefined {
  const chave = normalizarChaveTexto(textoBusca);
  return SEGMENTOS.find((s) => chave.includes(normalizarChaveTexto(s.rotulo)));
}

/** Verifica se o Nome de um produto pertence a um segmento (casamento por palavra-chave). */
export function produtoPertenceAoSegmento(nomeNormalizado: string, chaveSegmento: string): boolean {
  const segmento = SEGMENTOS.find((s) => s.chave === chaveSegmento);
  if (!segmento) return false;
  return segmento.palavrasChave.some((p) => nomeNormalizado.includes(p));
}

export function interpretarInstrucoes(texto: string): ResultadoInterpretacao {
  const diretivas: Diretiva[] = [];
  const naoReconhecidas: string[] = [];

  const sentencas = texto
    .split(/[\n.]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const original of sentencas) {
    const norm = normalizarChaveTexto(original);
    let reconhecida = false;

    if (/\bnao[- ]?cumulativo\b/.test(norm)) {
      diretivas.push({ tipo: "regime", regime: "nao_cumulativo" });
      reconhecida = true;
    } else if (/\bcumulativo\b/.test(norm)) {
      diretivas.push({ tipo: "regime", regime: "cumulativo" });
      reconhecida = true;
    }

    const matchExcluir = norm.match(/nao trabalha(?:mos)? com (.+)/);
    if (matchExcluir) {
      const segmento = identificarSegmento(matchExcluir[1]);
      if (segmento) {
        diretivas.push({ tipo: "excluir_segmento", chave: segmento.chave, rotulo: segmento.rotulo });
        reconhecida = true;
      }
    }

    const matchPadrao = norm.match(/todos os produtos sao (tributados?|isentos?|st\b|substituicao tributaria)/);
    if (matchPadrao) {
      const valor = matchPadrao[1];
      const padrao = valor.startsWith("isent") ? "isento" : valor.startsWith("tribut") ? "tributado" : "st";
      diretivas.push({ tipo: "forcar_padrao", padrao });
      reconhecida = true;
    }

    const matchReducao = norm.match(/reducao de (\d+(?:[.,]\d+)?)\s*%.*?para (.+)/);
    if (matchReducao) {
      const percentual = Number(matchReducao[1].replace(",", "."));
      const segmento = identificarSegmento(matchReducao[2]);
      if (segmento && Number.isFinite(percentual)) {
        diretivas.push({ tipo: "reducao_segmento", chave: segmento.chave, rotulo: segmento.rotulo, percentual });
        reconhecida = true;
      }
    }

    if (!reconhecida) naoReconhecidas.push(original);
  }

  return { diretivas, naoReconhecidas };
}

/** Descrição legível de uma diretiva já interpretada — usada no histórico de processamentos. */
export function descreverDiretiva(d: Diretiva): string {
  switch (d.tipo) {
    case "regime":
      return `Regime de PIS/COFINS: ${d.regime === "cumulativo" ? "cumulativo" : "não-cumulativo"}`;
    case "excluir_segmento":
      return `Não trabalha com ${d.rotulo}`;
    case "forcar_padrao":
      return `Todos os produtos são ${d.padrao}`;
    case "reducao_segmento":
      return `Redução de ${d.percentual}% para ${d.rotulo}`;
  }
}
