// Gera public/planilha-modelo.xlsx com um exemplo de cada tipo de operação.
// Rode com: npm run gerar-modelo

import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CABECALHO = [
  "Código",
  "Descrição",
  "NCM",
  "Origem",
  "Tipo Operação",
  "Destino",
  "Destinatário",
  "ST Bahia",
  "Monofásico PIS/COFINS",
  "Isento PIS/COFINS",
  "Anexo LC 214/2025",
];

const LINHAS: (string | number)[][] = [
  ["1001", "Parafuso sextavado zincado", "73181500", "0", "venda", "interna", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1002", "Refrigerante de cola 2L", "22021000", "0", "venda", "interestadual", "consumidor_final", "verificar", "sim", "nao", "verificar"],
  ["1003", "Compra de material de escritório", "48201000", "0", "compra", "interna", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1004", "Devolução de compra ao fornecedor", "73181500", "0", "devolucao_compra", "interestadual", "contribuinte", "verificar", "nao", "nao", "nao"],
  ["1005", "Devolução de venda do cliente", "73181500", "0", "devolucao_venda", "interna", "consumidor_final", "nao", "nao", "nao", "nao"],
  ["1006", "Transferência entre filiais", "73181500", "0", "transferencia", "interestadual", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1007", "Bonificação a cliente", "73181500", "0", "bonificacao_doacao", "interna", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1008", "Remessa de equipamento para conserto", "84713012", "0", "remessa_conserto", "interestadual", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1009", "Retorno de equipamento consertado", "84713012", "0", "retorno_conserto", "interestadual", "contribuinte", "nao", "nao", "nao", "nao"],
  ["1010", "Venda para órgão público", "73181500", "0", "venda", "interna", "orgao_publico", "nao", "nao", "nao", "verificar"],
];

const aba = XLSX.utils.aoa_to_sheet([CABECALHO, ...LINHAS]);
aba["!cols"] = CABECALHO.map(() => ({ wch: 24 }));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, aba, "Produtos");

const destino = resolve(__dirname, "..", "public", "planilha-modelo.xlsx");
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
writeFileSync(destino, buffer);
console.log(`Planilha-modelo gerada em ${destino}`);
