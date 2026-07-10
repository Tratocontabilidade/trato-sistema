// Testes automatizados do motor de classificação (lib/rules.ts) e das
// tabelas de referência (lib/tables.ts, lib/anexos.ts). Não depende de
// nenhum framework de teste — usa apenas node:assert, para não adicionar
// dependências novas ao projeto.
//
// Rode com: npm test

import assert from "node:assert/strict";
import { classificarProdutoCliente } from "../lib/rules";
import { parsearAnexo } from "../lib/anexos";
import { NCM_OVERRIDES } from "../lib/tables";
import type { ClientProdutoEntrada, ContextoClassificacao } from "../lib/types";
import type { AnexoEmpresa } from "../lib/empresas";

let passou = 0;
let falhou = 0;

function teste(nome: string, fn: () => void) {
  try {
    fn();
    passou++;
    console.log(`  OK  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}`);
    console.error(`       ${e instanceof Error ? e.message : e}`);
  }
}

function anexo(nome: string, ncms: string[]): AnexoEmpresa {
  return {
    id: nome,
    nome,
    ativo: true,
    colunas: { ncm: 0, descricao: 1 },
    linhas: ncms.map((ncm) => ({ ncm, descricao: "" })),
    criadoEm: new Date().toISOString(),
  };
}

function produto(overrides: Partial<ClientProdutoEntrada>): ClientProdutoEntrada {
  return {
    linha: 1,
    codigo: "1",
    nome: "",
    codigoBarras: "",
    un: "UN",
    precoUnit: 10,
    aliqFcp: "",
    tributacao: "Tributado",
    ncmOriginal: "",
    ncm: "",
    cfopSaidas: "",
    cstIcms: "",
    cstPisCofins: "",
    pis: null,
    cofins: null,
    natReceita: "",
    cstIbsCbs: "",
    cclasstrib: "",
    redBc: null,
    ibs: null,
    cbs: null,
    ...overrides,
  };
}

const contextoPadrao: ContextoClassificacao = { regime: "nao_cumulativo", diretivas: [] };

console.log("\n=== Bloco 1 — anexo de ST tem prioridade sobre NCM_OVERRIDES/Tributação ===");

teste("Batom NCM 33041000 fora do anexo ST-BA 2026 -> Padrão A (CFOP 5102, CST ICMS 000)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000", "24022000"]); // cerveja, cigarro — sem cosméticos
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({ nome: "BATOM LIQ DAILUS SISSONE", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5102");
  assert.equal(r.cstIcms, "000");
  assert.notEqual(r.status, "Dúvida — aguardando instrução");
});

teste("Batom com Tributação legada 'Substituição tributária' mas fora do anexo -> ainda Padrão A", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({
      nome: "BATOM LIQ DAILUS SISSONE",
      ncm: "33041000",
      ncmOriginal: "33041000",
      tributacao: "Substituição tributária",
    }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5102");
  assert.equal(r.cstIcms, "000");
});

teste("NCM presente no anexo ativo -> ST (CFOP 5405, CST ICMS 060)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({ nome: "Cerveja lata 350ml", ncm: "22030000", ncmOriginal: "22030000", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5405");
  assert.equal(r.cstIcms, "060");
});

teste("NCM_OVERRIDES nunca define cfopSaidas/cstIcms (garantia estrutural)", () => {
  for (const entrada of NCM_OVERRIDES) {
    assert.ok(!("cfopSaidas" in entrada.override), `entrada com prefixos ${entrada.prefixos} define cfopSaidas`);
    assert.ok(!("cstIcms" in entrada.override), `entrada com prefixos ${entrada.prefixos} define cstIcms`);
  }
});

teste("parsearAnexo descarta prefixo curto demais (proteção contra coluna mal mapeada)", () => {
  const linhasBrutas = [
    ["NCM", "Descricao"],
    ["3", "coluna errada (ex.: numero de item)"],
    ["22030000", "Cerveja"],
  ];
  const linhas = parsearAnexo(linhasBrutas, { ncm: 0, descricao: 1 });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].ncm, "22030000");
});

console.log("\n=== Bloco 2 — FCP 2% cosméticos (Bahia, IN SAT nº 005/2016) ===");

teste("Batom (33041000) sem anexo de ST -> FCP 2% preenchido automaticamente", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "BATOM LIQ DAILUS SISSONE", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, 2);
});

teste("Protetor solar (33049990) -> exceção, NÃO leva FCP", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "PROTETOR SOLAR SUNDOWN FPS 30",
      ncm: "33049990",
      ncmOriginal: "33049990",
      tributacao: "Tributado",
    }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, "");
  assert.ok(r.observacao.includes("exceção do FCP 2%"), r.observacao);
});

teste("Perfume (NCM 3303) nunca leva FCP mesmo sem nenhuma exceção de nome", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Perfume importado 100ml", ncm: "33030010", ncmOriginal: "33030010", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, "");
  assert.ok(!r.observacao.includes("FCP"));
});

teste("Talco (330491) -> exceção do FCP mesmo estando na faixa de pós/maquiagem", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Talco Granado 100g", ncm: "33049100", ncmOriginal: "33049100", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, "");
});

teste("Condicionador puro (33059000) -> exceção", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Condicionador hidratante 350ml", ncm: "33059000", ncmOriginal: "33059000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, "");
});

teste("Shampoo 2 em 1 condicionador (33059000) -> NÃO é exceção, leva FCP", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "Shampoo 2 em 1 condicionador anticaspa",
      ncm: "33059000",
      ncmOriginal: "33059000",
      tributacao: "Tributado",
    }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, 2);
});

teste("NCM na lista de FCP sem Nome preenchido -> Dúvida (regra de ouro, nunca chutar)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
  assert.equal(r.cfopSaidas, "");
});

teste("Item não tributado nunca recebe FCP automático (bloquearAutofill)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Batom isento", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Isento" }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, "");
});

teste("ALIQ. FCP já preenchida corretamente pelo cliente -> não é sobrescrita, status permanece OK", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "BATOM LIQ DAILUS SISSONE",
      ncm: "33041000",
      ncmOriginal: "33041000",
      tributacao: "Tributado",
      cfopSaidas: "5102",
      cstIcms: "000",
      cstPisCofins: "04", // monofásico (override de cosméticos)
      pis: 0,
      cofins: 0,
      natReceita: "002",
      cstIbsCbs: "000",
      cclasstrib: "000001",
      ibs: 0.1,
      cbs: 0.9,
      aliqFcp: 2,
    }),
    contextoPadrao
  );
  assert.equal(r.aliqFcp, 2);
  assert.equal(r.status, "OK");
});

teste("ALIQ. FCP preenchida com valor errado -> Divergência detectada", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "BATOM LIQ DAILUS SISSONE",
      ncm: "33041000",
      ncmOriginal: "33041000",
      tributacao: "Tributado",
      aliqFcp: 5,
    }),
    contextoPadrao
  );
  assert.ok(r.observacao.includes("ALIQ. FCP"));
});

console.log("\n=== Regressão urgente — NCM sujo/curto e NCM vazio não podem virar ST às cegas ===");

teste("NCM sujo de 7 dígitos (chocolate, fora do anexo ST-BA 2026) -> Padrão A, não ST", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000", "24022000"]); // cerveja, cigarro — sem chocolate
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({
      nome: "CHOC. LACTA VARIEDADES 332G",
      ncm: "1806900", // 7 dígitos — falta o zero final de "18069000"
      ncmOriginal: "1806900",
      tributacao: "Substituição tributária",
    }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5102");
  assert.equal(r.cstIcms, "000");
  assert.notEqual(r.status, "Dúvida — aguardando instrução");
});

teste("NCM vazio (wafer) -> Dúvida, nenhum campo de classificação preenchido", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({
      nome: "WAFER MAXI CHOC. BAUDUCCO 130G",
      ncm: "",
      ncmOriginal: "",
      tributacao: "Substituição tributária",
    }),
    contexto
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
  assert.equal(r.cfopSaidas, "");
  assert.equal(r.cstIcms, "");
});

teste("NCM vazio (whisky) -> Dúvida, nenhum campo de classificação preenchido", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "WHISKY TEACHER'S 250ML", ncm: "", ncmOriginal: "", tributacao: "Substituição tributária" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
  assert.equal(r.cfopSaidas, "");
});

teste("Nenhum produto com NCM começando com 1806 sai como ST (planilha real do Everildo)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000", "24022000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const nomes = [
    "GAROTO OVO DE PASCOA JOLIE 150G",
    "JAZAM COLORETI AMORE 500GR",
    "SERENATA DE AMOR OVO DE PASCOA 120G",
    "SURPRESA OVO PRINCESAS CAROAGEM 150G",
  ];
  for (const nome of nomes) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "18069000", ncmOriginal: "18069000", tributacao: "Substituição tributária" }),
      contexto
    );
    assert.equal(r.cfopSaidas, "5102", `${nome}: esperava CFOP 5102, veio ${r.cfopSaidas}`);
    assert.equal(r.cstIcms, "000", `${nome}: esperava CST ICMS 000, veio ${r.cstIcms}`);
  }
});

teste("Nenhum produto com NCM vazio sai com CFOP preenchido (todos vão para Dúvida)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const nomes = ["WAFER MIMNUETO LEITE", "WAFER MIRABEL CHOCOLATE 106G", "WHISKAS LATA PEIXE 290GR"];
  for (const nome of nomes) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "", ncmOriginal: "", tributacao: "Substituição tributária" }),
      contexto
    );
    assert.equal(r.status, "Dúvida — aguardando instrução", `${nome}: esperava Dúvida, veio ${r.status}`);
    assert.equal(r.cfopSaidas, "", `${nome}: CFOP deveria estar em branco`);
  }
});

teste("NCM sujo e curto que ESTÁ coberto por um prefixo do anexo ainda vira ST corretamente", () => {
  // Anexo em nível de categoria (4 dígitos, válido pelo piso de lib/anexos.ts) casa
  // mesmo com um NCM de produto sujo/curto, desde que o prefixo do anexo caiba nele.
  const stBa2026 = anexo("ST-BA 2026", ["2203"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({ nome: "Cerveja lata 350ml", ncm: "220300", ncmOriginal: "220300", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5405");
  assert.equal(r.cstIcms, "060");
});

console.log(`\n${passou} passaram, ${falhou} falharam.\n`);
if (falhou > 0) process.exit(1);
