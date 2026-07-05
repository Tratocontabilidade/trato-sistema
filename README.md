# Grade Tributária BA

Sistema web (Next.js 14 + TypeScript) que lê o "Cadastro de Produtos" — a
planilha de layout fixo que os clientes do escritório enviam — e devolve a
mesma planilha com os campos de classificação fiscal preenchidos ou
validados:

- **CFOP de saída, CST de ICMS, CST de PIS/COFINS e CST/cClassTrib de
  IBS/CBS**, preenchidos automaticamente com base na coluna **Tributação**
  (Tributado / Substituição tributária / Não tributado / Isento) e em
  sobrescritas por **NCM** (cesta básica, monofásicos, reduções específicas);
- Linhas que o cliente já enviou classificadas **não são sobrescritas** —
  apenas validadas (formato do código, coerência com o padrão esperado);
- Cada linha recebe um **Status** (`OK`, `Preenchido automaticamente`,
  `Divergência detectada` ou `Revisar manualmente`) e uma **Observação**
  explicando o motivo quando não for `OK`.

Todo o processamento acontece **no navegador**, em lotes (para não travar a
interface em planilhas de dezenas de milhares de linhas) — a planilha
enviada não é transmitida a nenhum servidor. Não há banco de dados nesta
fase.

> ⚠️ **Aviso**: este sistema apoia o trabalho do analista fiscal, mas **não
> substitui a revisão técnica** antes da emissão de documentos fiscais.
> Linhas com status diferente de `OK` exigem confirmação humana. A tabela de
> cClassTrib do IBS/CBS muda com frequência — confirme sempre a versão
> vigente no [Portal Nacional da NF-e](https://www.nfe.fazenda.gov.br).

## Estrutura do projeto

```
app/            → páginas (page.tsx, layout.tsx, globals.css) — interface web
lib/rules.ts    → motor de decisão fiscal (a "lógica de negócio")
lib/tables.ts   → padrões de Tributação e tabela aberta de sobrescritas por NCM
lib/excel.ts    → leitura da planilha do cliente e geração do Excel de saída
lib/types.ts    → tipos compartilhados
public/         → planilha-modelo.xlsx (exemplo de entrada, 30 linhas)
scripts/        → script que gera a planilha-modelo
```

O motor de regras (`lib/rules.ts` e `lib/tables.ts`) é isolado da interface
de propósito, para facilitar que novas regras/exceções por NCM sejam
adicionadas com o tempo. Para incluir um caso novo identificado na prática,
adicione uma entrada em `NCM_OVERRIDES`, em `lib/tables.ts`.

## Planilha de entrada

O sistema aceita **.xls ou .xlsx** no layout fixo "Cadastro de Produtos":
título mesclado na linha 1, cabeçalho na linha 2 e dados a partir da linha
3. A aba pode ter qualquer nome — o sistema usa a primeira aba que contiver
as 19 colunas abaixo (nesta ordem):

| Coluna | Observação |
| --- | --- |
| Código, Nome, Código de barras, UN, Preço unit., ALIQ. FCP | repassadas sem alteração |
| Tributação | `Tributado`, `Substituição tributária`, `Não tributado` ou `Isento` |
| NCM | aceita com ou sem pontos, ou incompleto — normalizado para só dígitos; se não tiver 8 dígitos, a linha é sinalizada |
| CFOP SAIDAS, CST ICMS, CST PIS/COFINS, CST IBS/CBS, Cclasstrib | se vazios, preenchidos automaticamente; se já preenchidos, apenas validados |
| PIS, COFINS, NAT. RECIETA, RED. B.C., IBS, CBS | idem — preenchidos ou validados conforme o padrão |

Baixe `public/planilha-modelo.xlsx` (link "Baixar planilha-modelo" na
própria interface) para ver um exemplo de cada situação: Tributado,
Substituição tributária, sobrescritas por NCM (carnes, cosméticos, escova
dental, inseticida), linhas já classificadas corretamente, cClassTrib com
quantidade errada de dígitos, Não tributado/Isento, NCM sujo e preenchimento
parcial.

### Regras de preenchimento

- **Tributado** → CFOP 5102, CST ICMS 000, CST PIS/COFINS 01 (PIS 1,65% /
  COFINS 7,6%), CST IBS/CBS 000, cClassTrib 000001 (IBS 0,1% / CBS 0,9%).
- **Substituição tributária** → mesmo padrão, com CFOP 5405 e CST ICMS 060.
- **Não tributado / Isento** → nada é preenchido automaticamente; a linha é
  sempre marcada para revisão manual.
- Sobrescritas por NCM (`lib/tables.ts`, tabela `NCM_OVERRIDES`) têm
  prioridade sobre o padrão de Tributação para os campos que definem.
- Se a linha já veio classificada pelo cliente, o motor **nunca sobrescreve**
  — só valida o formato do código (dígitos esperados) e a coerência com o
  padrão/sobrescrita aplicável, sinalizando divergência quando for o caso.

A saída mantém o mesmo layout (título mesclado, aba e cabeçalho originais
intactos), com duas colunas adicionais: **Status** (`OK`, `Preenchido
automaticamente`, `Divergência detectada` ou `Revisar manualmente`) e
**Observação** (motivo, quando o status não for `OK`).

## Rodando localmente

Pré-requisito: Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Para regenerar a planilha-modelo em `public/planilha-modelo.xlsx`:

```bash
npm run gerar-modelo
```

## Subindo para o GitHub

```bash
git init                     # se ainda não for um repositório
git add .
git commit -m "Grade Tributária BA"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/grade-tributaria-ba.git
git push -u origin main
```

## Deploy na Vercel

1. Acesse [vercel.com](https://vercel.com) e conecte sua conta GitHub.
2. Clique em **New Project** e selecione o repositório `grade-tributaria-ba`.
3. A Vercel detecta o Next.js automaticamente — nenhuma configuração
   adicional é necessária (não há variáveis de ambiente nem banco de dados).
4. Clique em **Deploy**.

A partir daí, todo `git push` na branch principal (`main`) gera
automaticamente um novo deploy.

## Manutenção das regras fiscais

- `lib/tables.ts` contém os padrões de Tributação (`PADRAO_TRIBUTADO`,
  `PADRAO_ST`) e a tabela aberta `NCM_OVERRIDES`, onde podem ser cadastradas
  regras específicas por NCM (ex.: um produto monofásico, um item de anexo
  da LC nº 214/2025) sem alterar o motor genérico em `lib/rules.ts`.
- Sempre que uma regra nova for identificada na prática contábil (um NCM, um
  padrão de Tributação diferente), descreva o caso (NCM ou prefixo, campos
  afetados, base legal) para que `NCM_OVERRIDES` seja atualizado.
- Depois de mudar `lib/tables.ts` ou `lib/rules.ts`, regenere a
  planilha-modelo (`npm run gerar-modelo`) e confira o resultado antes de
  publicar.

## Limitações conhecidas

- A tabela `NCM_OVERRIDES` cobre os casos citados no escopo deste projeto
  (carnes/cesta básica, escova dental, inseticida doméstico, cosméticos);
  novos NCMs devem ser cadastrados conforme identificados no uso real.
- A tabela de CST/cClassTrib do IBS/CBS muda com frequência — confirme
  sempre a versão vigente do Informe Técnico NF-e no Portal Nacional da NF-e
  antes de aplicar uma sobrescrita nova.
- A dependência `xlsx` é consumida via o pacote `@e965/xlsx` (republicação
  das versões oficiais mais recentes do SheetJS), pois o pacote `xlsx`
  publicado no npm está parado na versão 0.18.5, que possui vulnerabilidades
  conhecidas (prototype pollution e ReDoS) sem correção nessa distribuição.
- A tabela de resultado usa paginação (100 linhas por página) para manter a
  interface responsiva em planilhas com dezenas de milhares de linhas; o
  arquivo baixado contém todas as linhas.
