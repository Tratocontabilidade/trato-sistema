# Grade Tributária BA

Sistema web (Next.js 14 + TypeScript) que recebe uma planilha Excel de
produtos e devolve, para cada item, a classificação fiscal sugerida:

- **CFOP** de entrada/saída, conforme o tipo de operação, o destino (interna
  BA / interestadual / exportação) e a existência de Substituição Tributária
  de ICMS na Bahia;
- **CST de PIS e CST de COFINS**, conforme a Lei nº 10.637/2002, a Lei nº
  10.833/2003 e a IN RFB nº 2.121/2022;
- **CST do IBS/CBS e o cClassTrib** correspondente, conforme a Lei
  Complementar nº 214/2025 e a tabela do Informe Técnico NF-e 2025.002
  (Portal Nacional da NF-e).

Todo o processamento acontece **no navegador** — a planilha enviada não é
transmitida a nenhum servidor. Não há banco de dados nesta fase.

> ⚠️ **Aviso**: este sistema apoia o trabalho do analista fiscal, mas **não
> substitui a revisão técnica** antes da emissão de documentos fiscais.
> Itens marcados com alerta (ST, monofasia, isenção, enquadramento em anexo
> da LC nº 214/2025 etc.) exigem confirmação humana. A tabela de cClassTrib
> do IBS/CBS muda com frequência — confirme sempre a versão vigente no
> [Portal Nacional da NF-e](https://www.nfe.fazenda.gov.br).

## Estrutura do projeto

```
app/            → páginas (page.tsx, layout.tsx, globals.css) — interface web
lib/rules.ts    → motor de decisão fiscal (a "lógica de negócio")
lib/tables.ts   → tabelas de referência (CFOP, CST PIS/COFINS, CST/cClassTrib)
lib/excel.ts    → leitura da planilha de entrada e geração do Excel de saída
lib/types.ts    → tipos compartilhados
public/         → planilha-modelo.xlsx (exemplo de entrada)
scripts/        → script que gera a planilha-modelo
```

O motor de regras (`lib/rules.ts` e `lib/tables.ts`) é isolado da interface
de propósito, para facilitar que novas regras/exceções por NCM sejam
adicionadas com o tempo. Para incluir um caso novo identificado na prática,
adicione uma entrada em `ncmExcecoes`, em `lib/rules.ts`.

## Planilha de entrada

Aba **"Produtos"**, com as colunas:

| Coluna | Valores aceitos |
| --- | --- |
| Código | texto livre |
| Descrição | texto livre |
| NCM | 8 dígitos |
| Origem | código de origem do ICMS (0–8) |
| Tipo Operação | `venda`, `compra`, `devolucao_compra`, `devolucao_venda`, `transferencia`, `bonificacao_doacao`, `remessa_conserto`, `retorno_conserto` |
| Destino | `interna`, `interestadual`, `exportacao` |
| Destinatário | `consumidor_final`, `contribuinte`, `orgao_publico` |
| ST Bahia | `sim`, `nao`, `verificar` |
| Monofásico PIS/COFINS | `sim`, `nao`, `verificar` |
| Isento PIS/COFINS | `sim`, `nao`, `verificar` |
| Anexo LC 214/2025 | `sim`, `nao`, `verificar` |

Campos vazios são tratados como `verificar`. Baixe `public/planilha-modelo.xlsx`
(link "Baixar planilha-modelo" na própria interface) para ver um exemplo de
cada tipo de operação.

Quando um campo vier como `verificar` ou vazio, o sistema aplica a
classificação padrão mais conservadora e adiciona um alerta explícito na
coluna **Alertas** da planilha de saída, citando a norma que motiva a dúvida
— o sistema nunca crava uma classificação sensível (ST, monofasia, benefício
fiscal, imunidade) sem essa confirmação.

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

- `lib/tables.ts` contém as tabelas de referência (CFOP, CST PIS/COFINS,
  CST/cClassTrib do IBS/CBS). Atualize aqui quando uma tabela oficial mudar.
- `lib/rules.ts` contém a lógica de decisão e o mapa `ncmExcecoes`, onde
  podem ser cadastradas regras específicas por NCM (ex.: um produto
  monofásico específico, uma ST convenial, um item de anexo da LC nº
  214/2025) sem alterar o motor genérico.
- Sempre que uma regra nova for identificada na prática contábil, descreva o
  caso (NCM, operação, base legal) para que `lib/rules.ts`/`lib/tables.ts`
  sejam atualizados.

## Limitações conhecidas

- Exportação (saída) e importação/devolução de exportação (entrada) não têm
  um CFOP 7.xxx/3.xxx específico calculado automaticamente — o sistema
  sinaliza a necessidade de definição manual.
- A tabela de CST/cClassTrib do IBS/CBS implementada cobre os grupos citados
  no escopo deste projeto; classificações específicas por anexo da LC nº
  214/2025 (cesta básica, saúde, educação etc.) devem ser cadastradas em
  `ncmExcecoes` conforme identificadas.
- A dependência `xlsx` é consumida via o pacote `@e965/xlsx` (republicação
  das versões oficiais mais recentes do SheetJS), pois o pacote `xlsx`
  publicado no npm está parado na versão 0.18.5, que possui vulnerabilidades
  conhecidas (prototype pollution e ReDoS) sem correção nessa distribuição.
