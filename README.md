# Grade Tributária BA

Sistema web (Next.js 14 + TypeScript) para o escritório de contabilidade
classificar fiscalmente o "Cadastro de Produtos" — a planilha de layout
fixo que os clientes (supermercados na Bahia) enviam — devolvendo a mesma
planilha com os campos preenchidos ou validados, com memória por empresa:

- **Cadastro de empresas**: cada cliente tem regime tributário, instruções
  personalizadas, anexos de Substituição Tributária e regras aprendidas com
  correções manuais — tudo usado automaticamente no processamento daquela
  empresa.
- **Instruções em português livre** por processamento (regime cumulativo/
  não-cumulativo, "não trabalha com [segmento]", "todos os produtos são
  [padrão]", "considerar redução de X% para [segmento]") — o que não for
  reconhecido aparece num aviso, nunca é aplicado por adivinhação.
- **CFOP de saída, CST de ICMS, CST de PIS/COFINS e CST/cClassTrib de
  IBS/CBS**, preenchidos automaticamente com base na coluna **Tributação**,
  nos anexos de ST ativos da empresa e em sobrescritas por **NCM** (cesta
  básica, monofásicos, reduções específicas de supermercado).
- Linhas que o cliente já enviou classificadas **não são sobrescritas** —
  apenas validadas (formato do código, coerência com o padrão esperado).
- **Regra de ouro**: qualquer ambiguidade (segmento excluído por instrução,
  NCM sabidamente ambíguo, Tributação não reconhecida) nunca é "chutada" —
  vira Status `Dúvida — aguardando instrução`, com Observação explicando o
  motivo.
- **Histórico** por empresa (data, arquivo, instruções aplicadas, anexos
  ativos, contadores) e **aprendizado com correção**: compare um
  processamento anterior com a planilha que você corrigiu manualmente e
  aprove, uma a uma, as divergências que devem virar regras permanentes
  daquela empresa — nada é aplicado sem aprovação explícita.

Todo o processamento acontece **no navegador**, em lotes (para não travar a
interface em planilhas de dezenas de milhares de linhas) — a planilha
enviada não é transmitida a nenhum servidor. Cadastro de empresas, anexos,
regras aprendidas e histórico ficam em `localStorage` (sem backend nesta
fase); os arquivos de resultado de cada execução ficam em memória, e são
perdidos ao recarregar a página.

> ⚠️ **Aviso**: este sistema apoia o trabalho do analista fiscal, mas **não
> substitui a revisão técnica** antes da emissão de documentos fiscais.
> Linhas com status diferente de `OK` exigem confirmação humana — inclusive
> `Dúvida — aguardando instrução`, que nunca deve ser preenchida por chute.
> A tabela de cClassTrib do IBS/CBS muda com frequência — confirme sempre a
> versão vigente no [Portal Nacional da NF-e](https://www.nfe.fazenda.gov.br).
> As alíquotas de IBS/CBS usadas (`ALIQUOTA_IBS_TESTE`/`ALIQUOTA_CBS_TESTE`
> em `lib/tables.ts`) são as de teste do Informe Técnico NF-e — troque-as
> quando as alíquotas oficiais entrarem em vigor.

## Estrutura do projeto

```
app/page.tsx           → fluxo principal: Empresa → Instruções → Enviar → Conferir → Baixar
app/empresas/          → cadastro de empresas (criar/editar/excluir, anexos de ST)
app/historico/         → histórico de processamentos por empresa
app/aprender/          → comparação com planilha corrigida + aprovação de regras
app/layout.tsx          → layout raiz (fontes, tema, NavBar)
app/globals.css         → design system (tema claro/escuro)
app/components/         → componentes de UI (ver abaixo)

lib/rules.ts            → motor de decisão fiscal
lib/tables.ts           → padrões de Tributação, alíquotas de teste e tabela de sobrescritas por NCM
lib/instructions.ts     → interpretação de instruções em português livre
lib/anexos.ts           → leitura/mapeamento de anexos de ST
lib/empresas.ts         → cadastro de empresas (persistência em localStorage)
lib/historico.ts        → histórico de processamentos (metadados persistidos + cache em memória)
lib/aprendizado.ts      → comparação entre um resultado anterior e uma planilha corrigida
lib/armazenamento.ts    → wrapper fino sobre localStorage
lib/excel.ts            → leitura da planilha do cliente e geração do Excel de saída
lib/types.ts            → tipos compartilhados

public/                 → planilha-modelo.xlsx (exemplo de entrada, 30 linhas)
scripts/                → script que gera a planilha-modelo
```

O motor de regras (`lib/rules.ts`, `lib/tables.ts`, `lib/instructions.ts`,
`lib/anexos.ts`) é isolado da interface de propósito, para facilitar que
novas regras/exceções por NCM sejam adicionadas com o tempo. Para incluir
um caso novo identificado na prática, adicione uma entrada em
`NCM_OVERRIDES`, em `lib/tables.ts`.

### Fluxo principal (`app/page.tsx`)

1. **Empresa** — escolhe o cliente (ou cria um novo, inline).
2. **Instruções** — texto livre para este processamento, pré-preenchido com
   as instruções salvas na empresa.
3. **Enviar planilha** — upload `.xls`/`.xlsx`.
4. **Conferir classificação** — barra de progresso, depois resumo e tabela
   com filtro por Status.
5. **Baixar arquivo** — mesmo layout de entrada, com Status e Observação.

### Prioridade de resolução no motor (`lib/rules.ts`)

Da mais forte para a mais fraca: **regra aprendida da empresa** (por NCM,
Bloco de aprendizado) → **diretiva de instrução** do processamento (padrão
forçado, redução por segmento) → **anexo ativo da empresa** (decide ST) →
**sobrescrita por NCM** (`NCM_OVERRIDES`, incluindo entradas marcadas como
`ambiguo`, que forçam dúvida) → **padrão de Tributação** (Tributado/ST,
ajustado por regime cumulativo/não-cumulativo). Exclusão de segmento por
instrução e NCM ambíguo sempre vencem tudo isso, virando
`Dúvida — aguardando instrução` sem preencher nada.

## Planilha de entrada

O sistema aceita **.xls ou .xlsx** no layout fixo "Cadastro de Produtos":
título mesclado na linha 1, cabeçalho na linha 2 e dados a partir da linha
3. A aba pode ter qualquer nome — o sistema usa a primeira aba que contiver
as 19 colunas abaixo (nesta ordem):

| Coluna | Observação |
| --- | --- |
| Código, Nome, Código de barras, UN, Preço unit. | repassadas sem alteração |
| Tributação | `Tributado`, `Substituição tributária`, `Não tributado` ou `Isento` |
| NCM | aceita com ou sem pontos, ou incompleto — normalizado para só dígitos. **Vazio → `Dúvida — aguardando instrução`**, nada é preenchido (regra de ouro: sem NCM não dá para decidir ST/overrides). Com dígitos mas diferente de 8 (sujo/truncado) → ainda é classificado por casamento de prefixo contra anexos/`NCM_OVERRIDES`, com a linha sinalizada para conferência do NCM completo. |
| CFOP SAIDAS, CST ICMS, CST PIS/COFINS, CST IBS/CBS, Cclasstrib | se vazios, preenchidos automaticamente; se já preenchidos, apenas validados |
| PIS, COFINS, NAT. RECIETA, RED. B.C., IBS, CBS | idem — preenchidos ou validados conforme o padrão |
| ALIQ. FCP | repassada sem alteração, exceto para cosméticos/perfumaria sujeitos ao FCP 2% da Bahia (ver seção seguinte) |

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
  A ST em si é decidida pelo anexo ativo da empresa quando existe um (ver
  seção seguinte) — `NCM_OVERRIDES` nunca define CFOP/CST ICMS, de propósito,
  para que nenhuma sobrescrita interna force ST à revelia do anexo vigente.
- **Não tributado / Isento** → nada é preenchido automaticamente; a linha é
  sempre marcada para revisão manual.
- Sobrescritas por NCM (`lib/tables.ts`, tabela `NCM_OVERRIDES`) têm
  prioridade sobre o padrão de Tributação para os campos que definem, exceto
  quando um anexo de ST ativo da empresa ou uma regra aprendida dizem o
  contrário (ver ordem de prioridade acima).
- **ALIQ. FCP** é repasse para a maioria dos NCMs, mas o motor interpreta e
  preenche automaticamente **2%** para os NCMs de perfumaria/cosméticos da
  Bahia listados na Instrução Normativa SAT nº 005/2016 (`lib/tables.ts`,
  `avaliarFcpCosmeticos`), respeitando as exceções documentadas por
  palavra-chave no Nome do produto (ex.: protetor solar, talco, condicionador
  puro, uso medicinal). Quando o NCM está na lista mas o Nome está vazio (não
  dá para checar a exceção), a linha vira `Dúvida — aguardando instrução` em
  vez de arriscar um FCP errado.
- Se a linha já veio classificada pelo cliente, o motor **nunca sobrescreve**
  — só valida o formato do código (dígitos esperados) e a coerência com o
  padrão/sobrescrita aplicável, sinalizando divergência quando for o caso.

A saída mantém o mesmo layout (título mesclado, aba e cabeçalho originais
intactos), com duas colunas adicionais: **Status** (`OK`, `Preenchido
automaticamente`, `Divergência detectada`, `Revisar manualmente` ou `Dúvida
— aguardando instrução`) e **Observação** (motivo, quando o status não for
`OK`).

## Empresas, instruções e anexos de ST

Na tela **Empresas** (`/empresas`) você cadastra cada cliente: nome, CNPJ,
ramo, UF, regime tributário (Lucro Real = PIS/COFINS não-cumulativo por
padrão; Presumido/Simples = cumulativo) e instruções personalizadas. Editando
uma empresa já criada, você também pode subir **anexos de Substituição
Tributária** (Excel ou CSV — tolerante a variações de cabeçalho como "NCM"/
"N.C.M."/"Código NCM"; se não detectar automaticamente, a tela pede para
mapear manualmente as colunas). Anexos **ativos** passam a decidir a ST por
NCM no processamento, com prioridade sobre a coluna Tributação — e o motor
sinaliza divergência se o CFOP que o cliente já preencheu não bater com o
anexo. Quando a empresa tem pelo menos um anexo ativo, um NCM só é tratado
como ST se constar nele; um valor legado de "Substituição tributária" na
coluna Tributação do cliente nunca basta sozinho (ex.: se uma categoria
deixa de ser ST por mudança na legislação, atualizar/remover o item do
anexo é o que corrige a classificação — não é preciso mexer no código). Essa
checagem contra o anexo é feita por **casamento de prefixo**, então também
funciona para um NCM sujo/truncado do cliente (ex.: "1806900" com 7 dígitos
em vez de "18069000") — só um NCM **vazio** é tratado como impossível de
decidir e vira Dúvida.

No início de cada processamento, a tela **Instruções** também permite subir
um **anexo de ST só para aquela rodada** (mesma detecção de colunas e
mapeamento manual de fallback do cadastro da empresa). Esse anexo temporário
**substitui** os anexos ativos da empresa só durante aquele processamento —
o cadastro salvo não é alterado, e a tela mostra um aviso enquanto o anexo
temporário estiver em uso, com um botão para removê-lo e voltar ao que está
salvo na empresa. O resultado final sempre indica qual anexo foi usado
("Anexo utilizado: …").

Ainda na tela **Instruções**, dá para editar (só para aquela execução) o
texto salvo na empresa. Comandos reconhecidos na v1 (por palavra-chave, sem
IA externa):

- "regime cumulativo" / "regime não-cumulativo" — sobrescreve o regime
  padrão da empresa para PIS/COFINS;
- "não trabalha com [segmento]" — produtos daquele segmento (casados pelo
  Nome contra um dicionário de palavras-chave em `lib/instructions.ts`) viram
  `Dúvida — aguardando instrução`;
- "todos os produtos são [tributado/isento/ST]" — força o padrão para toda a
  planilha;
- "considerar redução de X% para [segmento]" — aplica a redução ao campo
  RED. B.C. dos produtos daquele segmento.

Instruções que não forem reconhecidas aparecem num aviso no topo do
resultado ("As seguintes instruções não foram aplicadas automaticamente")
— nunca são aplicadas por adivinhação.

## Histórico e aprendizado com correção

Cada processamento fica registrado no **Histórico** (`/historico`) por
empresa: data/hora, arquivo, instruções aplicadas, anexos ativos e
contadores. O arquivo de resultado em si fica em memória (perdido ao
recarregar a página) — navegando pelo menu (sem recarregar) ele continua
disponível para baixar de novo.

Em **Aprender com correção** (`/aprender`), escolha a empresa e um
processamento anterior, suba a planilha que você corrigiu manualmente no
Excel, e o sistema mostra, campo a campo, o que mudou (casando as linhas
pelo Código do produto). Para cada divergência: **Aprovar**, **Descartar**
ou **Aprovar todas do mesmo NCM**. Só depois de aprovadas as regras são
salvas na empresa (`RegraAprendida`) e passam a ter a maior prioridade nos
próximos processamentos — nada é aplicado sem essa aprovação explícita.

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

Para rodar os testes automatizados do motor de classificação
(`scripts/testar-regras.ts` — sem framework externo, só `node:assert`):

```bash
npm test
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
  `PADRAO_ST`), a tabela aberta `NCM_OVERRIDES` (onde podem ser cadastradas
  regras específicas por NCM, ex.: um produto monofásico, um item de anexo
  da LC nº 214/2025, sem alterar o motor genérico em `lib/rules.ts`) e a
  lista de FCP 2% de cosméticos da Bahia (`avaliarFcpCosmeticos`, IN SAT nº
  005/2016) — inclusive suas exceções por palavra-chave no Nome.
- A decisão de **Substituição Tributária nunca deve ir para `NCM_OVERRIDES`**
  — isso é intencional (o tipo `OverrideClassificacao` não tem campos de
  CFOP/CST ICMS). ST é sempre responsabilidade dos anexos da empresa
  (`lib/anexos.ts`); para tirar ou incluir uma categoria da ST, atualize o
  anexo, não o código.
- Sempre que uma regra nova for identificada na prática contábil (um NCM, um
  padrão de Tributação diferente), descreva o caso (NCM ou prefixo, campos
  afetados, base legal) para que `NCM_OVERRIDES`/FCP seja atualizado.
- Depois de mudar `lib/tables.ts` ou `lib/rules.ts`, rode `npm test` e
  regenere a planilha-modelo (`npm run gerar-modelo`) antes de publicar.

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
- O parser de instruções (`lib/instructions.ts`) é heurístico, baseado em
  palavras-chave e expressões regulares — não usa IA externa. Frases fora do
  vocabulário reconhecido aparecem no aviso "instruções não reconhecidas" e
  nunca são aplicadas silenciosamente.
- O casamento de "segmento" (usado nas diretivas de instrução) é feito por
  busca de palavras-chave no campo Nome do produto, pois o layout do cliente
  não tem uma coluna dedicada de segmento. É uma aproximação: produtos com
  nomes atípicos podem não ser reconhecidos por um segmento esperado.
- Anexos de ST e histórico de processamentos ficam em `localStorage`, que tem
  capacidade finita (tipicamente alguns MB por origem). O histórico mantém só
  as 20 execuções mais recentes por empresa, descartando as mais antigas
  quando necessário.
- Os resultados completos de cada processamento (usados no histórico e no
  fluxo de aprendizado) ficam em cache **só em memória** — não são
  persistidos. Um recarregamento completo da página (F5) limpa esse cache;
  navegue pelo menu superior (links internos) para preservá-lo entre telas.
- As exceções do FCP 2% de cosméticos (`avaliarFcpCosmeticos`) também são
  casadas por palavra-chave no Nome do produto (ex.: "protetor solar",
  "condicionador"), com a mesma limitação do casamento de segmento acima.
  Quando o NCM está na lista de FCP mas o Nome está vazio, a linha vira
  Dúvida em vez de arriscar; nomes fora do vocabulário reconhecido (ex.: uma
  grafia muito diferente de "protetor solar") não acionam a exceção e o
  produto recebe o FCP 2% padrão — confira manualmente casos de nome atípico.
- O casamento de NCM contra anexos e `NCM_OVERRIDES` é por **prefixo**
  (`startsWith`), então tolera um NCM do cliente mais curto que 8 dígitos
  (ex.: um zero final faltando). Isso só funciona quando o NCM do cliente é
  **igual ou mais longo** que o prefixo cadastrado no anexo/tabela — um NCM
  do cliente mais curto que o prefixo relevante (ex.: cliente com "18" e o
  anexo com "1806900") não casa, e o produto segue sem a confirmação do
  anexo. Nesses casos a linha fica com a divergência de dígitos sinalizada
  para conferência manual do NCM completo.
