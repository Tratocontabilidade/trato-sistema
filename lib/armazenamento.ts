// Wrapper fino sobre localStorage — tolerante à ausência de `window` (SSR)
// e a estouro de cota (navegação privada, quota excedida). Usado por
// lib/empresas.ts e lib/historico.ts para persistir dados sem backend.

const PREFIXO = "grade-tributaria:";

function chaveCompleta(chave: string): string {
  return `${PREFIXO}${chave}`;
}

export function lerJSON<T>(chave: string, valorPadrao: T): T {
  if (typeof window === "undefined") return valorPadrao;
  try {
    const bruto = window.localStorage.getItem(chaveCompleta(chave));
    if (!bruto) return valorPadrao;
    return JSON.parse(bruto) as T;
  } catch {
    return valorPadrao;
  }
}

/** Retorna false se não foi possível gravar (SSR ou cota excedida) — o chamador decide como reagir. */
export function gravarJSON(chave: string, valor: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(chaveCompleta(chave), JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function removerChave(chave: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chaveCompleta(chave));
  } catch {
    // ignora — nada a fazer se a remoção falhar
  }
}

export function gerarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
