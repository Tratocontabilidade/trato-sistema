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

teste("NCM vazio mas nome reconhecível (wafer) -> infere NCM, status de inferência (não Dúvida cega)", () => {
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
  assert.equal(r.status, "Preenchido com inferência de NCM — revisar");
  assert.equal(r.ncmOriginal, "190532");
  assert.ok(r.observacao.includes("NCM inferido do nome"), r.observacao);
  assert.equal(r.cfopSaidas, "5102");
});

teste("NCM vazio e nome NÃO reconhecível -> ainda vira Dúvida (inferência não força nada)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "PRODUTO GENERICO XPTO 500", ncm: "", ncmOriginal: "", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
  assert.equal(r.cfopSaidas, "");
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

teste("Produtos com NCM vazio e nome não reconhecível nunca saem com CFOP preenchido (vão para Dúvida)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const nomes = ["WHISKAS LATA PEIXE 290GR", "WHISKY TEACHER'S 250ML"];
  for (const nome of nomes) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "", ncmOriginal: "", tributacao: "Substituição tributária" }),
      contexto
    );
    assert.equal(r.status, "Dúvida — aguardando instrução", `${nome}: esperava Dúvida, veio ${r.status}`);
    assert.equal(r.cfopSaidas, "", `${nome}: CFOP deveria estar em branco`);
  }
});

teste("Produtos com NCM vazio mas nome reconhecível saem com NCM inferido, nunca cegos", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  // "chocolate" casa antes de "wafer" na ordem do dicionário -> infere 18069000 (chocolate),
  // não 190532 (wafer) — primeira palavra-chave a bater vence, comportamento esperado.
  const casos = [
    { nome: "WAFER MIMNUETO LEITE", ncmEsperado: "190532" },
    { nome: "WAFER MIRABEL CHOCOLATE 106G", ncmEsperado: "18069000" },
  ];
  for (const { nome, ncmEsperado } of casos) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "", ncmOriginal: "", tributacao: "Substituição tributária" }),
      contexto
    );
    assert.equal(r.status, "Preenchido com inferência de NCM — revisar", `${nome}: veio ${r.status}`);
    assert.equal(r.ncmOriginal, ncmEsperado, `${nome}: NCM inferido incorreto`);
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

console.log("\n=== Regime federal de PIS/COFINS (Everildo, Lucro Real, não-cumulativo) ===");

teste("BATOM (NCM 33041000) -> CST 04, PIS 0, COFINS 0, NAT. RECEITA 002 (monofásico cosmético)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "BATOM", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "04");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
  assert.equal(r.natReceita, "002");
});

teste("CERVEJA HEINEKEN LATA 350ML (NCM 22030000) -> CST 04, PIS 0, COFINS 0, NAT. RECEITA 002 (monofásico bebida fria)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "CERVEJA HEINEKEN LATA 350ML", ncm: "22030000", ncmOriginal: "22030000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "04");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
  assert.equal(r.natReceita, "002");
});

teste("ARROZ TIO JOÃO 5KG (NCM 10063021) -> CST 06, PIS 0, COFINS 0 (alíquota zero cesta básica)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ARROZ TIO JOÃO 5KG", ncm: "10063021", ncmOriginal: "10063021", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("FEIJÃO CARIOCA 1KG (NCM 07133399) -> CST 06, PIS 0, COFINS 0", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "FEIJÃO CARIOCA 1KG", ncm: "07133399", ncmOriginal: "07133399", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("LEITE UHT ITAMBÉ 1L (NCM 04012010) -> CST 06, PIS 0, COFINS 0", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "LEITE UHT ITAMBÉ 1L", ncm: "04012010", ncmOriginal: "04012010", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("FRALDA POMPOM RN (NCM 48184000) -> CST 04, PIS 0, COFINS 0, NAT. RECEITA 002 (monofásico)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "FRALDA POMPOM RN", ncm: "48184000", ncmOriginal: "48184000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "04");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
  assert.equal(r.natReceita, "002");
});

teste("PAPEL HIGIÊNICO NEVE FOLHA SIMPLES (NCM 48181000) -> CST 06, PIS 0, COFINS 0 (alíquota zero)", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "PAPEL HIGIÊNICO NEVE FOLHA SIMPLES",
      ncm: "48181000",
      ncmOriginal: "48181000",
      tributacao: "Tributado",
    }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("ESCOVA DE DENTE COLGATE (NCM 96032100) -> CST 04 (monofásico)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ESCOVA DE DENTE COLGATE", ncm: "96032100", ncmOriginal: "96032100", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "04");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("ESCOVA DE CABELO CONDOR (NCM 96032900) -> CST 01 (tributado normal, não é monofásica)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ESCOVA DE CABELO CONDOR", ncm: "96032900", ncmOriginal: "96032900", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "01");
  assert.equal(r.pis, 1.65);
  assert.equal(r.cofins, 7.6);
});

teste("CIGARRO DERBY 20 UNID (NCM 24022090) -> CST 05 (substituição tributária federal)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "CIGARRO DERBY 20 UNID", ncm: "24022090", ncmOriginal: "24022090", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "05");
  assert.equal(r.pis, 0);
  assert.equal(r.cofins, 0);
});

teste("ITEM CAJU (NCM 4818, sem subitem claro no nome) -> Dúvida", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ITEM CAJU", ncm: "48180000", ncmOriginal: "48180000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
  assert.equal(r.cstPisCofins, "");
});

teste("Escova de cabelo com NCM truncado '9603' (sem subitem) -> ambíguo por palavra-chave 'cabelo', segue Padrão A", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ESCOVA DE CABELO CONDOR", ncm: "9603", ncmOriginal: "9603", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "01");
});

teste("Escova com NCM truncado '9603' e nome sem 'dental' nem 'cabelo' -> Dúvida", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "ESCOVA MULTIUSO CONDOR", ncm: "9603", ncmOriginal: "9603", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
});

teste("NCM 0210 (carnes salgadas/defumadas) -> Dúvida, nunca presume alíquota zero para o capítulo inteiro", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "CARNE SECA KG", ncm: "02102000", ncmOriginal: "02102000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
});

teste("Sabão em barra (NCM 34011900) -> CST 06 alíquota zero, não monofásico", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "SABAO EM BARRA YPE 1KG", ncm: "34011900", ncmOriginal: "34011900", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Sabonete comum (NCM 34011100) -> CST 04 monofásico (resto do capítulo 3401)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "SABONETE LUX 90G", ncm: "34011100", ncmOriginal: "34011100", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "04");
});

teste("Produto sem regra federal específica (parafuso) -> CST 01 Padrão A, sem menção de PIS/COFINS na Observação", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "PARAFUSO SEXTAVADO", ncm: "73181500", ncmOriginal: "73181500", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "01");
  assert.equal(r.pis, 1.65);
  assert.equal(r.cofins, 7.6);
});

teste("Observação indica o regime federal aplicado (rastreabilidade para o analista fiscal)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "BATOM", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.ok(r.observacao.includes("PIS/COFINS: Monofásico"), r.observacao);
  assert.ok(r.observacao.includes("Lei nº 10.147/2000"), r.observacao);
});

teste("Regra aprendida da empresa tem prioridade sobre a tabela de regras federais", () => {
  const contexto: ContextoClassificacao = {
    ...contextoPadrao,
    regrasAprendidas: [
      {
        ncm: "33041000",
        campo: "cstPisCofins",
        valorAnterior: "04",
        valorNovo: "01",
        origem: "correção manual aprovada",
        aprovadoEm: new Date().toISOString(),
      },
    ],
  };
  const r = classificarProdutoCliente(
    produto({ nome: "BATOM", ncm: "33041000", ncmOriginal: "33041000", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.cstPisCofins, "01");
});

console.log("\n=== Correção urgente 1 — regime cumulativo/não-cumulativo não pode inverter ===");

teste("Lucro Real (não-cumulativo) -> PIS 1,65%, COFINS 7,6% (nunca o contrário)", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Parafuso sextavado", ncm: "73181500", ncmOriginal: "73181500", tributacao: "Tributado" }),
    { regime: "nao_cumulativo", diretivas: [] }
  );
  assert.equal(r.pis, 1.65);
  assert.equal(r.cofins, 7.6);
});

teste("Lucro Presumido (cumulativo) -> PIS 0,65%, COFINS 3%", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Parafuso sextavado", ncm: "73181500", ncmOriginal: "73181500", tributacao: "Tributado" }),
    { regime: "cumulativo", diretivas: [] }
  );
  assert.equal(r.pis, 0.65);
  assert.equal(r.cofins, 3);
});

console.log("\n=== Correção urgente 2 — ST só com confirmação do anexo, nunca por regra aprendida ===");

teste("NCM 8536.50.90 (interruptor) tributado + anexo ST-BA 2026 sem 8536 -> CFOP 5102, CST ICMS 000", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000", "24022000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const nomes = ["INT TRAMONTINA L", "INT 01 TECLA", "INTER 2TEC PAR", "INTER 1TEC SIM"];
  for (const nome of nomes) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "85365090", ncmOriginal: "85365090", tributacao: "Tributado" }),
      contexto
    );
    assert.equal(r.cfopSaidas, "5102", `${nome}: veio ${r.cfopSaidas}`);
    assert.equal(r.cstIcms, "000", `${nome}: veio ${r.cstIcms}`);
  }
});

teste("NCM 7607.19.90 (papel alumínio/marmitex) tributado + anexo ST-BA 2026 sem 7607 -> CFOP 5102, CST ICMS 000", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000", "24022000"]);
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const nomes = ["MARMITEX ALUM N08 850ML", "PAPEL ALUM BOREDA", "FORRO DE FOGAO", "MARMITINHA BAND. ALUM."];
  for (const nome of nomes) {
    const r = classificarProdutoCliente(
      produto({ nome, ncm: "76071990", ncmOriginal: "76071990", tributacao: "Tributado" }),
      contexto
    );
    assert.equal(r.cfopSaidas, "5102", `${nome}: veio ${r.cfopSaidas}`);
    assert.equal(r.cstIcms, "000", `${nome}: veio ${r.cstIcms}`);
  }
});

teste("Regra aprendida NUNCA pode definir cfopSaidas/cstIcms — anexo continua mandando", () => {
  const stBa2026 = anexo("ST-BA 2026", ["22030000"]);
  const contexto: ContextoClassificacao = {
    ...contextoPadrao,
    anexosAtivos: [stBa2026],
    regrasAprendidas: [
      {
        ncm: "85365090",
        campo: "cfopSaidas",
        valorAnterior: "5102",
        valorNovo: "5405", // regra aprendida por engano tentando forçar ST
        origem: "correção manual aprovada por engano",
        aprovadoEm: new Date().toISOString(),
      },
      {
        ncm: "85365090",
        campo: "cstIcms",
        valorAnterior: "000",
        valorNovo: "060",
        origem: "correção manual aprovada por engano",
        aprovadoEm: new Date().toISOString(),
      },
    ],
  };
  const r = classificarProdutoCliente(
    produto({ nome: "INT TRAMONTINA L", ncm: "85365090", ncmOriginal: "85365090", tributacao: "Tributado" }),
    contexto
  );
  // O anexo (sem 8536) deve vencer a regra aprendida corrompida — nunca ST.
  assert.equal(r.cfopSaidas, "5102");
  assert.equal(r.cstIcms, "000");
});

teste("Regra aprendida continua funcionando normalmente para campos que não são cfopSaidas/cstIcms", () => {
  const contexto: ContextoClassificacao = {
    ...contextoPadrao,
    regrasAprendidas: [
      {
        ncm: "73181500",
        campo: "natReceita",
        valorAnterior: "",
        valorNovo: "999",
        origem: "correção manual aprovada",
        aprovadoEm: new Date().toISOString(),
      },
    ],
  };
  const r = classificarProdutoCliente(
    produto({ nome: "Parafuso", ncm: "73181500", ncmOriginal: "73181500", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.natReceita, "999");
});

console.log("\n=== Correção urgente 4 — reavaliação da tabela de regras federais ===");

teste("Farinha de mandioca (NCM 11062000) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Farinha de mandioca", ncm: "11062000", ncmOriginal: "11062000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Queijo (NCM 04061000) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Queijo mussarela", ncm: "04061000", ncmOriginal: "04061000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Óleo de milho (NCM 15152900) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Óleo de milho", ncm: "15152900", ncmOriginal: "15152900", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Açúcar refinado (NCM 17019900) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Açúcar refinado", ncm: "17019900", ncmOriginal: "17019900", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Café torrado (NCM 09012100) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Café torrado e moído", ncm: "09012100", ncmOriginal: "09012100", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

teste("Sal (NCM 25010020) -> CST 06 alíquota zero", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "Sal refinado", ncm: "25010020", ncmOriginal: "25010020", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstPisCofins, "06");
});

console.log("\n=== Benefícios fiscais de ICMS-BA — operações internas (Art. 265/268 RICMS-BA, Art. 16 Lei 7.014/96) ===");

const casosIcmsBa: { nome: string; ncm: string; cstEsperado: string; descricao: string }[] = [
  { nome: "TOMATE CEREJA 500G", ncm: "07020000", cstEsperado: "040", descricao: "isento hortifrúti" },
  { nome: "BATATA INGLESA KG", ncm: "07019000", cstEsperado: "040", descricao: "isento hortifrúti" },
  { nome: "ALHO NACIONAL 200G", ncm: "07032010", cstEsperado: "000", descricao: "exceção expressa - alho" },
  { nome: "MAÇÃ FUJI KG", ncm: "08081000", cstEsperado: "040", descricao: "isento hortifrúti" },
  { nome: "CASTANHA DE CAJU 200G", ncm: "08013200", cstEsperado: "000", descricao: "exceção expressa - castanha" },
  { nome: "FEIJÃO CARIOCA 1KG", ncm: "07133399", cstEsperado: "040", descricao: "isento Art. 265 II c" },
  { nome: "ARROZ TIO JOÃO 5KG", ncm: "10063021", cstEsperado: "040", descricao: "isento Art. 265 II c" },
  { nome: "FARINHA DE MANDIOCA 1KG", ncm: "11062000", cstEsperado: "040", descricao: "isento Art. 265 II b" },
  { nome: "SAL REFINADO CISNE 1KG", ncm: "25010020", cstEsperado: "040", descricao: "isento Art. 265 II d" },
  { nome: "OVO BRANCO GRANDE 30 UNID", ncm: "04072100", cstEsperado: "040", descricao: "isento Art. 265 II k" },
  {
    nome: "LEITE PASTEURIZADO INTEGRAL 1L",
    ncm: "04012010",
    cstEsperado: "040",
    descricao: "isento (pasteurizado)",
  },
  { nome: "LEITE UHT ITAMBÉ 1L", ncm: "04012010", cstEsperado: "000", descricao: "não isento (UHT)" },
  { nome: "OLEO DE SOJA SOYA 900ML", ncm: "15079019", cstEsperado: "020", descricao: "redução carga 12%" },
  { nome: "MACARRÃO ESPAGUETE ADRIA 500G", ncm: "19021900", cstEsperado: "000", descricao: "alíquota 7% (nota)" },
  { nome: "SALMÃO FRESCO KG", ncm: "03021400", cstEsperado: "020", descricao: "peixe, redução carga 12%" },
  {
    nome: "TOMATE PELADO ITALIANO 400G LATA",
    ncm: "20029000",
    cstEsperado: "000",
    descricao: "industrializado, não é hortifrúti",
  },
  {
    nome: "SUCO DE LARANJA NATURAL ONE 1L",
    ncm: "20091100",
    cstEsperado: "000",
    descricao: "industrializado, não é hortifrúti",
  },
];

for (const caso of casosIcmsBa) {
  teste(`${caso.nome} (NCM ${caso.ncm}) -> CST ICMS ${caso.cstEsperado} (${caso.descricao})`, () => {
    const r = classificarProdutoCliente(
      produto({ nome: caso.nome, ncm: caso.ncm, ncmOriginal: caso.ncm, tributacao: "Tributado" }),
      contextoPadrao
    );
    assert.equal(r.cstIcms, caso.cstEsperado, `veio ${r.cstIcms}, observação: ${r.observacao}`);
  });
}

teste("Macarrão (NCM 1902) leva a nota de alíquota 7% na Observação, mesmo com CST 000", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "MACARRÃO ESPAGUETE ADRIA 500G", ncm: "19021900", ncmOriginal: "19021900", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.ok(r.observacao.includes("Alíquota 7%"), r.observacao);
  assert.ok(r.observacao.includes("Lei 7.014/96"), r.observacao);
});

teste("Isenção hortifrúti mostra a base legal na Observação", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "TOMATE CEREJA 500G", ncm: "07020000", ncmOriginal: "07020000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.ok(r.observacao.includes("Art. 265, I 'a'"), r.observacao);
});

teste("NCM 0703 truncado (4 dígitos, sem saber se é alho) -> Dúvida, nunca presume", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "CEBOLINHA ALHO VARIADOS", ncm: "0703", ncmOriginal: "0703", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
});

teste("Hortifrúti fresco com nome indicando produto industrializado (mesmo caindo no NCM 07/08) -> Dúvida", () => {
  const r = classificarProdutoCliente(
    produto({
      nome: "MILHO VERDE EM CONSERVA 200G",
      ncm: "07099000",
      ncmOriginal: "07099000",
      tributacao: "Tributado",
    }),
    contextoPadrao
  );
  assert.equal(r.status, "Dúvida — aguardando instrução");
});

teste("Benefício de ICMS-BA nunca se aplica quando o produto é ST (anexo vence)", () => {
  const stBa2026 = anexo("ST-BA 2026", ["07020000"]); // hipotético — anexo confirmando ST para o NCM do tomate
  const contexto: ContextoClassificacao = { ...contextoPadrao, anexosAtivos: [stBa2026] };
  const r = classificarProdutoCliente(
    produto({ nome: "TOMATE CEREJA 500G", ncm: "07020000", ncmOriginal: "07020000", tributacao: "Tributado" }),
    contexto
  );
  assert.equal(r.cfopSaidas, "5405");
  assert.equal(r.cstIcms, "060");
});

teste("Regra aprendida NUNCA sobrescreve o benefício de ICMS-BA (cstIcms continua bloqueado)", () => {
  const contexto: ContextoClassificacao = {
    ...contextoPadrao,
    regrasAprendidas: [
      {
        ncm: "07020000",
        campo: "cstIcms",
        valorAnterior: "040",
        valorNovo: "000",
        origem: "correção manual aprovada por engano",
        aprovadoEm: new Date().toISOString(),
      },
    ],
  };
  const r = classificarProdutoCliente(
    produto({ nome: "TOMATE CEREJA 500G", ncm: "07020000", ncmOriginal: "07020000", tributacao: "Tributado" }),
    contexto
  );
  // A isenção do Art. 265 continua valendo — regra aprendida não pode mexer em cstIcms.
  assert.equal(r.cstIcms, "040");
});

teste("Leite de cabra (Art. 265 I h) tem prioridade sobre a regra geral de leite pasteurizado/UHT", () => {
  const r = classificarProdutoCliente(
    produto({ nome: "LEITE DE CABRA INTEGRAL UHT 1L", ncm: "04019000", ncmOriginal: "04019000", tributacao: "Tributado" }),
    contextoPadrao
  );
  assert.equal(r.cstIcms, "040");
  assert.ok(r.observacao.includes("I 'h'"), r.observacao);
});

console.log(`\n${passou} passaram, ${falhou} falharam.\n`);
if (falhou > 0) process.exit(1);
