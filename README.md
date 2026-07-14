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
- **Regra de ouro**: qualquer ambiguidade sem nenhum padrão conservador
  seguro (segmento excluído por instrução, NCM sabidamente ambíguo,
  Tributação não reconhecida, NCM com dígitos insuficientes) nunca é
  "chutada" — vira Status `Dúvida — aguardando instrução`, com Observação
  explicando o motivo. Quando existe um padrão conservador claro (o NCM
  bate com um item de ST/redução/isenção, mas o Nome do produto não
  confirma a categoria), a linha é classificada automaticamente como
  Tributado normal em vez de Dúvida — decisão de política para acelerar a
  revisão, sempre citando a rejeição na Observação (ver "Empresas,
  instruções e anexos de ST" abaixo).
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
lib/tables.ts           → padrões de Tributação, alíquotas de teste e tabela de sobrescritas de IBS/CBS por NCM
lib/regras-federais.ts  → regime federal de PIS/COFINS por NCM (monofásico, alíquota zero, ST federal)
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

O motor de regras (`lib/rules.ts`, `lib/tables.ts`, `lib/regras-federais.ts`,
`lib/instructions.ts`, `lib/anexos.ts`) é isolado da interface de propósito,
para facilitar que novas regras/exceções por NCM sejam adicionadas com o
tempo. Para incluir um caso novo de IBS/CBS identificado na prática,
adicione uma entrada em `NCM_OVERRIDES` (`lib/tables.ts`); para um caso de
regime federal de PIS/COFINS, adicione em `lib/regras-federais.ts` — são
tabelas separadas porque tratam de obrigações e bases legais diferentes.

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
**sobrescrita de IBS/CBS por NCM** (`NCM_OVERRIDES`, incluindo entradas
marcadas como `ambiguo`, que forçam dúvida), em paralelo para os campos de
PIS/COFINS, **regra federal por NCM/Nome** (`lib/regras-federais.ts`,
incluindo entradas ambíguas), e, para o CST ICMS de produtos que não são ST,
**benefício fiscal de ICMS-BA** (`avaliarBeneficioIcmsBa`, isenção/redução
para operações internas, incluindo casos ambíguos) → **padrão de
Tributação** (Tributado/ST, ajustado por regime cumulativo/não-cumulativo)
como último recurso. Exclusão de segmento por instrução, NCM ambíguo,
regime federal ambíguo e benefício de ICMS-BA ambíguo sempre vencem tudo
isso, virando `Dúvida — aguardando instrução` sem preencher nada.

`NCM_OVERRIDES`, `lib/regras-federais.ts` e `avaliarBeneficioIcmsBa`
resolvem obrigações diferentes (IBS/CBS, PIS/COFINS federal e ICMS
estadual, cada uma com base legal e lista de NCM próprias) e por isso não
têm campos em comum — um item pode ter redução de IBS/CBS sem ter regime
federal especial de PIS/COFINS nem benefício de ICMS-BA, e vice-versa.

**Exceção estrutural:** CFOP SAIDAS e CST ICMS (os dois campos que decidem
ST **e** os benefícios fiscais de ICMS-BA) **nunca** aceitam regra
aprendida, mesmo que exista uma salva para o NCM — a única autoridade para
esses dois campos é o anexo ativo (ST), a coluna Tributação (validada
normalmente) e a tabela de benefícios de ICMS-BA. Isso evita que uma
correção aprovada por engano no fluxo de aprendizado (ex.: "Aprovar todas
do mesmo NCM" clicado errado) trave um NCM em ST — ou anule uma isenção —
para sempre, por fora das fontes de verdade vigentes. Por isso a tela
"Aprender com correção" também não oferece mais esses dois campos para
aprendizado.

## Planilha de entrada

O sistema aceita **.xls ou .xlsx** no layout fixo "Cadastro de Produtos":
título mesclado na linha 1, cabeçalho na linha 2 e dados a partir da linha
3. A aba pode ter qualquer nome — o sistema usa a primeira aba que contiver
as 19 colunas abaixo (nesta ordem):

| Coluna | Observação |
| --- | --- |
| Código, Nome, Código de barras, UN, Preço unit. | repassadas sem alteração |
| Tributação | `Tributado`, `Substituição tributária`, `Não tributado` ou `Isento` |
| NCM | aceita com ou sem pontos, ou incompleto — normalizado para só dígitos. **Vazio** → tenta inferir pelo Nome primeiro (ver "Inferência de NCM por Nome" abaixo); se não conseguir, `Dúvida — aguardando instrução`, nada é preenchido (regra de ouro: sem NCM não dá para decidir ST/overrides). Com dígitos mas diferente de 8 (sujo/truncado) → ainda é classificado por casamento de prefixo contra anexos/`NCM_OVERRIDES`, com a linha sinalizada para conferência do NCM completo. |
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
- Sobrescritas de IBS/CBS por NCM (`lib/tables.ts`, tabela `NCM_OVERRIDES`)
  têm prioridade sobre o padrão de Tributação para os campos que definem,
  exceto quando um anexo de ST ativo da empresa ou uma regra aprendida dizem
  o contrário (ver ordem de prioridade acima). Categorias em que o NCM
  sozinho cobre produtos claramente diferentes (arroz/feijão, leite, pão/
  panificação, carnes — ex.: NCM 1905.90.90 cobre tanto pão quanto batata
  chips) exigem confirmação por palavra-chave no Nome
  (`palavrasChaveExigidas` na entrada da tabela). Quando o NCM bate mas o
  Nome não confirma, o cClassTrib **não** vira Dúvida — cai em
  **000001 (tributação integral)** automaticamente, citando a rejeição na
  Observação (mesma decisão de política do casamento com anexos de ST,
  abaixo).
- **CST PIS/COFINS, PIS, COFINS e NAT. RECEITA** são resolvidos por
  `lib/regras-federais.ts` (monofásico, alíquota zero ou substituição
  tributária federal por NCM, com desempate por palavra-chave no Nome
  quando o NCM sozinho não decide) — ver seção seguinte para a lista
  completa e as bases legais.
- **CST ICMS**, quando o produto não é ST, também pode ser sobrescrito por
  um benefício fiscal de ICMS-BA para operações internas (isenção, redução
  de base de cálculo) — ver "Benefícios fiscais de ICMS-BA" abaixo.
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

### Regime federal de PIS/COFINS (`lib/regras-federais.ts`)

Sortimento típico de supermercado, cada categoria com base legal citada no
código para defesa em fiscalização. Quando uma regra é aplicada, a
Observação da linha mostra o regime e a base legal (ex.: "PIS/COFINS:
Monofásico — Lei nº 10.147/2000...").

| Regime | CST | Categorias | Base legal |
| --- | --- | --- | --- |
| Monofásico (alíquota zero na revenda) | 04 | Cosméticos/perfumaria/higiene (cap. 33, escovas dentais 9603.21), bebidas frias (águas, refrigerantes, isotônicos, energéticos, cerveja — 2201-2203), autopeças (pneus, câmaras de ar, peças de veículo — 4011/4013/8708/9026/9029/9031/9032), combustíveis (2710/2711), lenços de papel e fraldas/absorventes (4818.20/4818.40) | Lei nº 10.147/2000; Lei nº 10.833/2003 art. 58; Lei nº 10.485/2002; Lei nº 9.718/1998 |
| Alíquota zero | 06 | Cesta básica federal (feijão, arroz, farinha de trigo/mandioca, pão comum, leite/queijos, ovos, carnes frescas de boi/porco/aves, peixes frescos, óleo de soja/milho, manteiga, açúcar 1701.14/1701.99, café torrado 0901.21, sal), sabão em barra (3401.19), papel higiênico folha simples (4818.10) | Lei nº 10.925/2004, art. 1º |
| Substituição tributária federal | 05 | Cigarros (2402) | Lei nº 9.532/1997, art. 53 |
| Tributado normal (fallback) | 01 | Todo o resto — PIS 1,65% / COFINS 7,6% (ou 0,65%/3% no regime cumulativo) | — |

Casos que exigem cuidado extra, sempre documentados em comentário no código:

- **Escovas (capítulo 9603)**: só a dental (9603.21) é monofásica; de
  cabelo/roupa/limpeza (9603.29) é tributada normalmente. O NCM completo já
  desambigua a maioria dos casos; quando vem truncado só em "9603", o motor
  usa palavra-chave no Nome ("dental"/"dente"/"oral" → monofásico;
  "cabelo"/"roupa"/"limpeza" → normal) e vira Dúvida se nem assim decidir.
- **4818 (papel/celulose)**: 4818.10 é alíquota zero, mas 4818.20 e 4818.40
  são monofásicos — um NCM truncado em "4818" sem o subitem vira Dúvida.
- **3401 (sabões)**: 3401.19 (sabão em barra) é alíquota zero; o resto do
  capítulo (sabonetes) é monofásico.
- **0210 (carnes salgadas/em salmoura/secas/defumadas)**: só alguns
  subitens têm alíquota zero pela Lei nº 10.925/2004 — o motor nunca
  presume para o capítulo inteiro e sempre vira Dúvida, pedindo o subitem
  exato.
- A lista de cesta básica federal (PIS/COFINS) **não é idêntica** à lista de
  cesta básica do IBS/CBS em `NCM_OVERRIDES` — são obrigações com bases
  legais diferentes (Lei nº 10.925/2004 x LC nº 214/2025), então um NCM pode
  ter redução de IBS/CBS sem ter alíquota zero de PIS/COFINS, ou vice-versa.

### Benefícios fiscais de ICMS-BA (`lib/tables.ts`, `avaliarBeneficioIcmsBa`)

Isenção, redução de base de cálculo e alíquota reduzida de **ICMS**, só para
operações **internas** na Bahia (CFOP 5xxx) — interestaduais ficam para um
ciclo futuro. Sobrescreve o CST ICMS 000 padrão quando o produto não é ST
(o anexo ativo sempre decide ST primeiro, por cima de qualquer benefício).

| Regime | CST | Categorias | Base legal |
| --- | --- | --- | --- |
| Isenção | 040 | Hortifrutícolas frescos (cap. 07/08, exceto alho e castanhas/nozes/amêndoas/avelãs), leite pasteurizado tipo A/B ou magro (não o UHT), leite de cabra, farinha de mandioca, arroz, feijão, sal, fubá/farinha de milho, ovos, polpa de cacau | Art. 265, incisos I e II, do RICMS-BA (Decreto nº 13.780/2012) |
| Redução de BC (carga 12%) | 020 | Óleo refinado de soja, óleo refinado de algodão, peixes e carnes de peixe | Art. 268, XXII e LXIX, do RICMS-BA |
| Alíquota reduzida 7% | 000 (nota na Observação) | Macarrão (NCM 1902) | Art. 16, I "a", da Lei nº 7.014/96 |

**Princípio de interpretação**: quando a Lei nº 7.014/96 previa alíquota
reduzida de 7% e o RICMS-BA (norma mais recente e mais específica) depois
previu isenção para o mesmo produto, prevalece a **isenção** — por isso o
Art. 265 é sempre consultado primeiro; só o macarrão manteve a alíquota
residual de 7% (nunca migrou para isenção).

Casos que exigem confirmação por palavra-chave no Nome — quando o NCM bate
mas a confirmação falha, **não** vira Dúvida: cai em **CST ICMS 000**
automaticamente, citando a rejeição na Observação (mesma decisão de
política do casamento com anexos de ST, acima):

- **Arroz/feijão (NCM 1006, 0713.31-35)**: exige "arroz" ou "feijão" no
  Nome. Sem confirmação, CST 000.
- **Óleo de soja (NCM 1507.90)**: exige "óleo" **e** "soja" no Nome. Óleo
  de algodão (NCM 1512.29) exige "óleo" **e** "algodão" — são checados
  separadamente, um não confirma o outro.
- **Leite (NCM 0401.20)**: o mesmo NCM cobre pasteurizado (isento) e UHT/
  longa vida (não isento) — só o Nome distingue ("pasteurizado"/"tipo A"/
  "tipo B"/"magro" → isento; "UHT"/"longa vida" → não isento). Sem nenhum
  dos dois sinais no Nome, CST 000 (não presume isenção).
- Se o Nome de um produto do capítulo 07/08 sugerir industrialização
  ("conserva", "seco", "desidratado", "enlatado", "em calda",
  "cristalizado"), CST 000 em vez da isenção — o NCM (fresco) e o Nome
  (processado) estão em conflito, e o padrão conservador vence.

Casos que continuam sendo genuína Dúvida — faltam **dígitos do NCM**, não
uma confirmação de Nome, então não há um padrão conservador seguro para
aplicar automaticamente:

- **Alho (dentro de 0703)**: cebola, alho-poró e outros produtos da mesma
  posição são isentos, mas alho é exceção expressa — precisa dos 6 dígitos
  do NCM para diferenciar; um NCM truncado em "0703" vira Dúvida (não dá
  pra saber se o CST correto é 040 ou 000 sem o subitem completo).
- **Castanhas, nozes, amêndoas e avelãs (posições 0801/0802 inteiras)**:
  exceção expressa da isenção de frutas frescas — nunca isentas por essa
  regra, mesmo com NCM na faixa de frutas.
- Assim como CFOP SAIDAS, **CST ICMS nunca aceita regra aprendida** — nem
  mesmo para "corrigir" um benefício fiscal. Se um benefício estiver saindo
  errado, revise a tabela `avaliarBeneficioIcmsBa` em `lib/tables.ts`, não o
  fluxo de aprendizado.

### Inferência de NCM por Nome (`lib/tables.ts`, `INFERENCIA_NCM_POR_NOME`)

Quando o NCM vem vazio mas o Nome do produto é claro ("CHOCOLATE NESTLÉ
200G" é obviamente NCM 1806), o motor tenta inferir o NCM por palavra-chave
antes de desistir para Dúvida. Tabela aberta com ~25 categorias (chocolate,
wafer, biscoito, cerveja, refrigerante, água mineral, leite, arroz, feijão,
farinha de trigo, açúcar, óleo de soja, café, sabão em barra, sabonete,
xampu, condicionador, creme dental, escova dental, papel higiênico, fralda,
absorvente, detergente, amaciante, desinfetante, água sanitária).

**Nunca confunde NCM real com NCM inferido**: toda linha que usa essa
inferência sai com o Status dedicado **"Preenchido com inferência de NCM —
revisar"** (cor própria na interface, nunca `OK` nem `Preenchido
automaticamente` comum) e a Observação sempre começa com "NCM inferido do
nome (...) — validar antes de emitir NF-e". Quando o Nome não bate com
nenhuma entrada, o comportamento continua o de sempre: `Dúvida — aguardando
instrução`, sem preencher nada.

A saída mantém o mesmo layout (título mesclado, aba e cabeçalho originais
intactos), com duas colunas adicionais: **Status** (`OK`, `Preenchido
automaticamente`, `Preenchido com inferência de NCM — revisar`,
`Divergência detectada`, `Revisar manualmente` ou `Dúvida — aguardando
instrução`) e **Observação** (motivo, quando o status não for `OK`).

## Empresas, instruções e anexos de ST

Na tela **Empresas** (`/empresas`) você cadastra cada cliente: nome, CNPJ,
ramo, UF, regime tributário (Lucro Real = PIS/COFINS não-cumulativo, 1,65%/
7,6%; Presumido/Simples = cumulativo, 0,65%/3%) e instruções personalizadas.
O regime tributário **não tem valor pré-selecionado** — o campo começa
vazio e obriga uma escolha explícita antes de salvar, de propósito: um
padrão silencioso arriscaria salvar o regime errado (e inverter as
alíquotas de PIS/COFINS de todo o processamento) se ninguém reparasse no
campo ao cadastrar uma empresa nova. Editando
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

**Refinamento por palavra-chave para NCMs de família ampla.** Casar só por
prefixo não basta quando o anexo lista um NCM amplo que cobre produtos bem
diferentes entre si — dois exemplos reais: o NCM 2106.90.1x ("outras
preparações alimentícias não especificadas") cobre tanto bebidas
energéticas/xarope pré-mix/hidroeletrolíticas (ST) quanto achocolatados,
sucos em pó e chás em pó (não-ST); o NCM 1905.90.90 cobre tanto pão/bolo/
pizza (ST, segundo itens típicos do ST-BA) quanto batata chips e
salgadinhos de pacote (não-ST). Casar por `startsWith` sozinho varreria os
segundos para dentro da ST por engano. `lib/anexos.ts:buscarNoAnexo`
resolve isso em duas camadas:

1. **Tabela curada** (`PALAVRAS_CHAVE_POR_DESCRICAO_ANEXO` em
   `lib/tables.ts`) — mapeia trechos da Descrição para grupos de
   palavras-chave já validados em ciclos anteriores, incluindo sinônimos de
   marca que o Nome real do produto usa em vez do termo genérico da lei
   (ex.: "energy"/"gatorade" em vez de "energética"/"hidroeletrolítica").
   Sorvete (NCM 2105) é o único caso sem palavra-chave exigida — o capítulo
   inteiro é sorvete, então a entrada mapeada casa direto.
2. **Extração automática** (`extrairPalavrasChaveDescricao`, também em
   `lib/tables.ts`) — para qualquer Descrição não coberta pela tabela
   curada (ex.: "Outros pães", "Outros bolos... e pizzas"), extrai os
   substantivos de categoria do texto (ignorando conectivos, qualificadores
   genéricos como "outros"/"industrializado" e embalagens como "lata"/
   "pet"/"vidro") e casa por token inteiro contra o Nome do produto — nunca
   por substring solta, para uma palavra curta como "pão" não colidir com
   um trecho de outra palavra maior (ex.: "presunto"). Quando a extração não
   encontra nenhuma palavra-chave útil (Descrição vazia ou só conectivos),
   mantém o comportamento histórico: casa direto pelo NCM.

Continua varrendo as demais linhas do anexo mesmo depois de uma rejeição —
um mesmo NCM pode aparecer em mais de um item (ex.: "Outros pães" e "Outros
bolos... pizzas" no mesmo NCM 1905.90.90); só rejeita se **nenhuma** linha
confirmar. Isso vale igualmente para anexos salvos na empresa e para o
anexo temporário da tela de Instruções — os dois passam pela mesma função.

**Qualificador obrigatório e exclusão por palavra — quando "bater uma
palavra-chave" não basta.** A tabela curada também suporta duas camadas
extras, verificadas nessa ordem antes dos grupos de palavra-chave normais:

1. **Qualificador obrigatório** (`qualificadoresObrigatorios`) — para itens
   do anexo cuja Descrição é altamente específica dentro de um NCM amplo.
   Ex.: o item "misturas/preparações **para pães**" (NCM 1901.20) não cobre
   mistura para bolo nem pão de queijo, mesmo estando no mesmo NCM — sem
   "pão"/"pães" no Nome, rejeita antes de olhar mais nada.
2. **Exclusão por palavra** (`exclusoesPorPalavra`) — para NCMs de uso
   duplo, onde o padrão é confirmar mas certas palavras no Nome indicam o
   uso alternativo. Ex.: o item "algodão, atadura, esparadrapo, gazes..."
   (NCM 3005, seção de medicamentos) é ST por padrão, mas "maquiagem"/
   "esmalte"/"demaquilante" no Nome indicam algodão cosmético (mesmo NCM,
   tratamento fiscal diferente) — rejeita mesmo sem checar mais nada.
   Também cobre o caso combinado (qualificador + exclusão juntos): o item de
   álcool combustível (NCM 2207.10.9) exige "combustível"/"carro"/"veículo"
   no Nome **e** rejeita se aparecer "limpeza"/"doméstico"/"sanitário", já
   que ambos podem coexistir num Nome mal formatado.

Cada rejeição carrega o motivo específico na Observação ("...mas o Nome não
contém o qualificador obrigatório (X/Y)..." ou "...mas o Nome indica uso
diferente do previsto ('Z')..."), distinto da mensagem genérica de
"nenhuma palavra-chave bate" — a analista sabe exatamente qual camada
rejeitou sem precisar reabrir o anexo original.

**Decisão de política — rejeição vira Tributado normal, não Dúvida.**
Quando o NCM bate com um item do anexo mas nenhuma palavra-chave da
Descrição aparece no Nome do produto, a linha **não** vira
`Dúvida — aguardando instrução` — é classificada automaticamente como
Tributado normal (CFOP 5102, CST ICMS 000), citando o item do anexo
rejeitado na Observação para a analista auditar depois. Essa é uma mudança
deliberada (autorizada pela contratante): revisar uma planilha cheia de
linhas em branco custa mais tempo do que revisar linhas já classificadas
com uma nota de auditoria — e como o padrão de rejeição é sempre o mais
conservador (tributação integral, sem redução/ST), o risco fiscal de uma
rejeição errada é menor do que o de uma ST/redução aplicada errada. A
regra de ouro clássica (nunca chutar) continua valendo só para os casos em
que **nem o NCM nem o Nome** permitem qualquer conclusão — NCM vazio sem
inferência possível, ou NCM com dígitos insuficientes para saber qual
subitem se aplica (ex.: "0703" truncado, que pode ser cebola isenta ou
alho não-isento).

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

**CFOP SAIDAS e CST ICMS ficam fora dessa tela de propósito** — são os
campos que decidem ST, e ST é sempre responsabilidade do anexo ativo da
empresa (nunca de uma regra memorizada por NCM). Se um produto está saindo
como ST indevidamente (ou o contrário), corrija atualizando o anexo, não
aprovando uma correção manual desses dois campos.

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
  `PADRAO_ST`), a tabela aberta `NCM_OVERRIDES` de **IBS/CBS** (onde podem
  ser cadastradas regras específicas por NCM, ex.: um item de anexo da LC nº
  214/2025, sem alterar o motor genérico em `lib/rules.ts`) e a lista de FCP
  2% de cosméticos da Bahia (`avaliarFcpCosmeticos`, IN SAT nº 005/2016) —
  inclusive suas exceções por palavra-chave no Nome.
- `lib/regras-federais.ts` contém a tabela aberta de regime federal de
  **PIS/COFINS** por NCM (monofásico, alíquota zero, ST federal). É
  deliberadamente separada de `NCM_OVERRIDES` — são obrigações diferentes,
  com listas de NCM e bases legais próprias, e um item pode se encaixar
  numa sem se encaixar na outra.
- `lib/tables.ts` também contém `INFERENCIA_NCM_POR_NOME` (tabela aberta de
  palavras-chave → NCM inferido, usada só quando o NCM vem vazio). Novas
  entradas devem citar o NCM na maior precisão disponível (8 dígitos quando
  possível) e nunca eliminar o status dedicado de inferência — a inferência
  existe para reduzir Dúvidas evitáveis, não para fingir que o NCM veio do
  cliente.
- `lib/tables.ts` também contém `avaliarBeneficioIcmsBa` — benefícios
  fiscais de **ICMS** (isenção Art. 265, redução de BC Art. 268, alíquota
  reduzida Art. 16 da Lei nº 7.014/96) para operações internas na Bahia. É
  deliberadamente separada de `NCM_OVERRIDES` (IBS/CBS) e de
  `lib/regras-federais.ts` (PIS/COFINS) — três obrigações diferentes, três
  tabelas diferentes, cada uma com sua base legal e lista de NCM.
- A decisão de **Substituição Tributária (ICMS) nunca deve ir para
  `NCM_OVERRIDES`** — isso é intencional (o tipo `OverrideClassificacao` não
  tem campos de CFOP/CST ICMS, nem de PIS/COFINS). ST de ICMS é sempre
  responsabilidade dos anexos da empresa (`lib/anexos.ts`); para tirar ou
  incluir uma categoria da ST, atualize o anexo, não o código. Já a "ST
  federal" de PIS/COFINS (CST 05, ex.: cigarros) é uma obrigação diferente e
  vive em `lib/regras-federais.ts`.
- Toda entrada nova em `lib/regras-federais.ts` e em `avaliarBeneficioIcmsBa`
  precisa citar a base legal (lei/artigo) em comentário E na `observacao`
  retornada — ela aparece na Observação da linha classificada, para o
  analista fiscal defender a classificação em uma fiscalização.
- Sempre que uma regra nova for identificada na prática contábil (um NCM, um
  padrão de Tributação diferente), descreva o caso (NCM ou prefixo, campos
  afetados, base legal) para que `NCM_OVERRIDES`, `lib/regras-federais.ts`,
  `avaliarBeneficioIcmsBa` ou a lista de FCP seja atualizada.
- Depois de mudar `lib/tables.ts`, `lib/regras-federais.ts` ou `lib/rules.ts`,
  rode `npm test` e regenere a planilha-modelo (`npm run gerar-modelo`)
  antes de publicar.

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
- O refinamento por palavra-chave do casamento com anexos de ST tem duas
  camadas (ver "Empresas, instruções e anexos de ST" acima): uma tabela
  curada (`PALAVRAS_CHAVE_POR_DESCRICAO_ANEXO` em `lib/tables.ts`, com
  sinônimos de marca já validados) e uma extração automática
  (`extrairPalavrasChaveDescricao`) para qualquer outra Descrição. A
  extração automática é heurística de verdade: remove conectivos e
  qualificadores genéricos de uma lista fixa, singulariza plurais regulares
  (removendo o "s" final) mais uma pequena lista de plurais irregulares do
  domínio (hoje só "pão"/"pães") — não é um analisador morfológico
  completo. Uma Descrição com um plural irregular não mapeado, ou um
  substantivo de categoria fora do que a lista de conectivos/qualificadores
  espera, pode extrair uma palavra-chave a mais ou a menos do que o
  ideal; revise a Observação das linhas rejeitadas/confirmadas por essa via
  quando cadastrar um anexo com descrições muito diferentes dos exemplos já
  testados (bebidas, panificação).
- Os campos `qualificadoresObrigatorios`/`exclusoesPorPalavra` (qualificador
  obrigatório e exclusão por palavra) só existem na **tabela curada**
  (`PALAVRAS_CHAVE_POR_DESCRICAO_ANEXO`) — a extração automática (para
  descrições não cobertas pela tabela curada) ainda não suporta essas duas
  camadas. Um NCM de uso duplo (ex.: um NCM cosmético/medicinal novo, fora
  dos já cadastrados) cai no comportamento de palavra-chave simples até
  ganhar uma entrada curada dedicada. Além disso, o gatilho da tabela curada
  (`gatilhosDescricao`) é comparado contra a Descrição de **qualquer** linha
  de anexo cujo NCM já bateu com o produto, sem restringir a qual NCM a
  entrada curada foi pensada para — uma Descrição de um NCM totalmente
  diferente que coincidentemente contenha o mesmo trecho (ex.: "algodão"
  aparecendo dentro de uma descrição de óleo de algodão) pode, em teoria,
  acionar a entrada errada. Não é um problema observado na prática (os
  gatilhos usados são termos específicos do domínio), mas é uma limitação
  arquitetural a ter em mente ao cadastrar entradas curadas novas com
  gatilhos muito genéricos.
- **Decisão de política**: quando o NCM bate com um item do anexo de ST (ou
  com uma sobrescrita de `NCM_OVERRIDES`/benefício de ICMS-BA que exige
  palavra-chave) mas o Nome do produto não confirma, a linha **não** vira
  Dúvida — é classificada automaticamente como Tributado normal (ou
  cClassTrib 000001 / CST ICMS 000, conforme o caso), citando a rejeição na
  Observação. Essa é uma troca deliberada de recall por velocidade de
  revisão: um produto que deveria ser ST/isento mas tem o Nome atípico
  (ex.: uma marca que não usa a palavra genérica da lei) vai sair
  classificado como Tributado normal em vez de aparecer sinalizado à parte
  — a auditoria depende inteiramente de reler a Observação de cada linha
  "Preenchido automaticamente", não existe mais uma lista separada de
  "pendências" para esses casos.
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
- A tabela de regime federal de PIS/COFINS (`lib/regras-federais.ts`) cobre
  o sortimento típico de supermercado citado no escopo deste projeto
  (cosméticos, bebidas frias, autopeças, combustíveis, cesta básica federal,
  cigarros); novos NCMs/categorias devem ser cadastrados conforme
  identificados no uso real, sempre citando a base legal. Ela não cobre
  todo o universo de regimes especiais de PIS/COFINS do Direito Tributário
  federal — só o que é relevante para o sortimento de supermercado na
  Bahia.
- A lista de cesta básica federal (Lei nº 10.925/2004) implementada não é
  idêntica à lista de cesta básica do IBS/CBS em `NCM_OVERRIDES` (ex.:
  massas alimentícias — NCM 1902 — e hortaliças/frutas frescas dos
  capítulos 07/08 têm redução de IBS/CBS mas não constam na lista federal
  de PIS/COFINS implementada) — reflete diferenças reais entre as duas
  leis, não é uma omissão a corrigir sem confirmar a base legal antes.
- NCM 0210 (carnes salgadas/em salmoura/secas/defumadas) sempre vira Dúvida
  por decisão deliberada: só alguns subitens da Lei nº 10.925/2004 têm
  alíquota zero, e o sistema não presume qual sem o NCM completo de 8
  dígitos.
- A inferência de NCM por Nome (`INFERENCIA_NCM_POR_NOME`) é heurística por
  palavra-chave, com a mesma limitação do casamento de segmento/FCP: nomes
  fora do vocabulário reconhecido não inferem nada (a linha segue para
  Dúvida, comportamento seguro) e a primeira palavra-chave que bater vence
  quando o nome contém mais de uma (ex.: "wafer chocolate" infere o NCM de
  chocolate, não o de wafer, porque "chocolate" vem antes na tabela). Como
  toda linha inferida sai com status e Observação dedicados exigindo
  revisão, um match "errado" nunca é silencioso.
- O cadastro de empresa exige a escolha explícita do regime tributário (sem
  valor padrão) — uma empresa criada antes dessa mudança e sem edição
  posterior mantém o que já estava salvo; confira o campo "Regime
  tributário" de clientes cadastrados em versões anteriores do sistema se
  houver dúvida sobre as alíquotas de PIS/COFINS aplicadas.
- Os benefícios fiscais de ICMS-BA (`avaliarBeneficioIcmsBa`) cobrem só
  **operações internas na Bahia** (CFOP 5xxx) — o escopo deste ciclo,
  conforme o perfil do Everildo (só vendas dentro do estado). Operações
  interestaduais (CFOP 6xxx) não são tratadas por essa tabela ainda; um NCM
  isento internamente não deve ser presumido isento numa venda
  interestadual sem confirmar a legislação aplicável.
- A lista de NCM/palavra-chave dos benefícios de ICMS-BA cobre o sortimento
  citado no escopo deste ciclo (hortifrutícolas, leite, arroz/feijão, sal,
  farinha, ovos, óleo, peixes, macarrão); o RICMS-BA (Art. 265/268) tem
  outros incisos e alíneas não cobertos aqui — novas categorias devem ser
  adicionadas conforme identificadas no uso real, sempre citando o
  inciso/alínea exato.
