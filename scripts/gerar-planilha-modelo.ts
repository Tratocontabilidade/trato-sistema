// Gera public/planilha-modelo.xlsx no layout fixo "Cadastro de Produtos"
// que os clientes do escritório enviam: título mesclado na linha 1,
// cabeçalho na linha 2, dados a partir da linha 3.
//
// As linhas cobrem: Tributado, Substituição tributária, sobrescritas por
// NCM (carnes, xampu/cosmético, escova dental, inseticida), cClassTrib com
// quantidade errada de dígitos, linhas já classificadas corretamente (OK),
// Não tributado/Isento (revisar manualmente), Tributação não reconhecida,
// NCM sujo (com pontos, curto, vazio), preenchimento parcial e FCP 2% de
// cosméticos na Bahia (IN SAT nº 005/2016): item elegível preenchido
// automaticamente e item elegível com exceção pelo nome (protetor solar).
//
// Rode com: npm run gerar-modelo

import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CABECALHO = [
  "Código",
  "Nome",
  "Código de barras",
  "UN",
  "Tributação",
  "Preço unit.",
  "NCM",
  "CFOP SAIDAS",
  "ALIQ. FCP",
  "CST ICMS",
  "CST PIS/COFINS",
  "PIS",
  "COFINS",
  "NAT. RECIETA",
  "CST IBS/CBS",
  "Cclasstrib",
  "RED. B.C.",
  "IBS",
  "CBS",
];

type Linha = (string | number)[];

const linhas: Linha[] = [
  // 1-2: Tributado, tudo em branco -> Preenchido automaticamente (Padrão A)
  ["1001", "Parafuso sextavado zincado", "7891000000011", "UN", "Tributado", 3.5, "73181500", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1002", "Prego 18x30", "7891000000028", "CX", "Tributado", 12.9, "73170010", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 3-4: Substituição tributária, tudo em branco -> Preenchido automaticamente (Padrão B)
  ["1003", "Pilha alcalina AA", "7891000000035", "PC", "Substituição tributária", 4.2, "85061000", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1004", "Bateria 9V", "7891000000042", "PC", "Substituição tributária", 15.0, "85068000", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 5-7, 27: Tributado + NCM carne (override cesta básica) -> Preenchido automaticamente
  ["1005", "Carne bovina resfriada kg", "7891000000059", "KG", "Tributado", 32.0, "02013000", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1006", "Carne suína resfriada kg", "7891000000066", "KG", "Tributado", 18.5, "02032900", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1007", "Frango inteiro congelado kg", "7891000000073", "KG", "Tributado", 9.9, "02071200", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1027", "Carne caprina resfriada kg", "7891000000264", "KG", "Tributado", 28.0, "02042100", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 8-9, 28: Tributado + NCM cosmético/higiene (override monofásico) -> Preenchido automaticamente
  ["1008", "Xampu 350ml", "7891000000080", "UN", "Tributado", 14.9, "33051000", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1009", "Desodorante aerosol", "7891000000097", "UN", "Tributado", 11.5, "33072010", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1028", "Creme de pentear 500ml", "7891000000271", "UN", "Tributado", 13.2, "33072090", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 10: Tributado + NCM escova dental (override redução 60%)
  ["1010", "Escova dental macia", "7891000000103", "UN", "Tributado", 3.9, "96032100", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 11: Tributado + NCM inseticida doméstico (override redução 60%)
  ["1011", "Inseticida aerosol 300ml", "7891000000110", "UN", "Tributado", 16.9, "38089410", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 12-13: já classificadas corretamente pelo cliente -> OK
  ["1012", "Produto tributado já classificado", "7891000000127", "UN", "Tributado", 20.0, "39269090", "5102", "", "000", "01", 1.65, 7.6, "", "000", "000001", "", 0.1, 0.9],
  ["1013", "Produto com ST já classificado", "7891000000134", "UN", "Substituição tributária", 22.0, "40169300", "5405", "", "060", "01", 1.65, 7.6, "", "000", "000001", "", 0.1, 0.9],

  // 14-16: cClassTrib com quantidade errada de dígitos -> Divergência detectada
  ["1014", "Produto com cClassTrib de 7 dígitos (a mais)", "7891000000141", "UN", "Tributado", 25.0, "39269090", "5102", "", "000", "01", 1.65, 7.6, "", "000", "2000003", "", 0.1, 0.9],
  ["1015", "Produto com cClassTrib de 5 dígitos (a menos)", "7891000000158", "UN", "Tributado", 19.0, "39269090", "5102", "", "000", "01", 1.65, 7.6, "", "000", "20003", "", 0.1, 0.9],
  ["1016", "Produto com cClassTrib de 7 dígitos (zero a mais)", "7891000000165", "UN", "Tributado", 21.0, "39269090", "5102", "", "000", "01", 1.65, 7.6, "", "000", "0000001", "", 0.1, 0.9],

  // 17: CST ICMS preenchido diferente do padrão esperado -> Divergência detectada
  ["1017", "Produto com CST ICMS divergente", "7891000000172", "UN", "Tributado", 17.0, "39269090", "", "", "40", "", "", "", "", "", "", "", "", ""],

  // 18-19: Não tributado / Isento -> Revisar manualmente (sem preenchimento automático)
  ["1018", "Produto não tributado", "7891000000189", "UN", "Não tributado", 5.0, "49019900", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1019", "Produto isento", "7891000000196", "UN", "Isento", 6.0, "49019900", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 20: Tributação não reconhecida -> Revisar manualmente
  ["1020", "Produto com tributação suspensa", "7891000000202", "UN", "Suspenso", 8.0, "39269090", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 21: NCM sujo (com pontos) -> Preenchido automaticamente
  ["1021", "Envelope de papel", "7891000000219", "UN", "Tributado", 2.5, "4820.20.00", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 22: NCM curto (5 dígitos) -> Divergência detectada (NCM inválido)
  ["1022", "Produto com NCM incompleto", "7891000000226", "UN", "Tributado", 10.0, "16185", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 23: NCM vazio -> Divergência detectada
  ["1023", "Produto sem NCM informado", "7891000000233", "UN", "Tributado", 12.0, "", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 24: PIS informado diferente do padrão -> Divergência detectada
  ["1024", "Produto com PIS divergente", "7891000000240", "UN", "Tributado", 30.0, "39269090", "", "", "", "", 2.5, "", "", "", "", "", "", ""],

  // 25-26: variedade adicional, tudo em branco -> Preenchido automaticamente
  ["1025", "Cadeira de escritório", "7891000000257", "UN", "Tributado", 350.0, "94013000", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["1026", "Extensão elétrica 5m", "7891000000301", "UN", "Substituição tributária", 28.0, "85446000", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 29: preenchimento parcial (CFOP já preenchido corretamente, resto em branco) -> Preenchido automaticamente
  ["1029", "Produto com preenchimento parcial", "7891000000288", "UN", "Tributado", 15.5, "39269090", "5102", "", "", "", "", "", "", "", "", "", "", ""],

  // 30: NAT. RECEITA preenchida sem motivo (diverge do esperado vazio) -> Divergência detectada
  ["1030", "Produto com NAT. RECEITA divergente", "7891000000295", "UN", "Tributado", 9.5, "39269090", "", "", "", "", "", "", "999", "", "", "", "", ""],

  // 31: NCM elegível ao FCP 2% (batom) -> ALIQ. FCP preenchida automaticamente em 2%
  ["1031", "BATOM LIQ DAILUS SISSONE", "7891000000301", "UN", "Tributado", 8.9, "33041000", "", "", "", "", "", "", "", "", "", "", "", ""],

  // 32: NCM elegível ao FCP 2% mas exceção pelo Nome (protetor solar) -> ALIQ. FCP não preenchida
  ["1032", "PROTETOR SOLAR SUNDOWN FPS 30", "7891000000318", "UN", "Tributado", 39.9, "33049990", "", "", "", "", "", "", "", "", "", "", "", ""],
];

const NUM_COLUNAS = CABECALHO.length;
const linhaTitulo: Linha = new Array(NUM_COLUNAS).fill("");
linhaTitulo[0] = "Cadastro de Produtos";

const aoa: Linha[] = [linhaTitulo, CABECALHO, ...linhas];
const sheet = XLSX.utils.aoa_to_sheet(aoa);
sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NUM_COLUNAS - 1 } }];
sheet["!cols"] = CABECALHO.map(() => ({ wch: 18 }));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "Cadastro_de_Produtos");

const destino = resolve(__dirname, "..", "public", "planilha-modelo.xlsx");
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
writeFileSync(destino, buffer);
console.log(`Planilha-modelo gerada em ${destino} (${linhas.length} linhas de dados)`);
