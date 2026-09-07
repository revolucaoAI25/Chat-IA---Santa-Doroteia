# Assistente Institucional — Colégio Santa Dorotéia

Protótipo funcional de um assistente com IA que responde perguntas de alunos,
responsáveis e professores **exclusivamente** com base nos documentos oficiais
da escola, citando a fonte de cada afirmação.

Não é uma maquete: tem banco de dados, busca vetorial, pipeline de ingestão com
OCR, extração automática de datas e controle de acesso por perfil de verdade.

---

## O que já funciona

| Área | Estado |
|---|---|
| Login por matrícula, com perfis aluno/professor/coordenação/admin | ✅ |
| Chat com resposta em streaming e citação dos documentos | ✅ |
| Painel lateral da fonte: trecho usado, metadados, prévia e download do PDF | ✅ |
| IA contextualizada por quem pergunta (papel + série, ou disciplinas) | ✅ |
| Ingestão de PDF, DOCX, CSV, XLSX, TXT e imagens | ✅ |
| OCR para digitalizações e imagens (via modelo multimodal) | ✅ |
| Classificação automática: tipo, segmento, série, ano letivo, vigência | ✅ |
| Extração automática de datas de provas/eventos + fila de revisão humana | ✅ |
| Recorte de acesso por série/segmento/papel — inclusive no que a IA busca | ✅ |
| Vigência de documentos (expiram e deixam de ser fonte) | ✅ |
| Deduplicação por checksum | ✅ |
| Telemetria de tokens/latência por resposta | ✅ |
| Whitelabel editável: cores, tipografia, logo e nome | ✅ |
| Controles de exibição no upload (ano, etapa, segmento, série, público) | ✅ |
| Reescrita de pergunta (resolve "e a de história?") | ✅ |
| Pergunta de esclarecimento quando — e só quando — é ambíguo | ✅ |
| Agenda estruturada injetada nas perguntas de data | ✅ |
| Tela de Documentos: o acervo visível ao perfil, com busca e filtro por tipo | ✅ |
| Contexto do usuário mantido pela secretaria (tela de Usuários) | ✅ |
| Cadastro de usuários pelo painel (nome, matrícula, papel, série, senha) | ✅ |
| "Ver como": o administrador confere a tela pelos olhos de um aluno ou professor | ✅ |
| Série avança sozinha na virada do ano letivo | ✅ |
| Data e etapa (trimestre) vigentes no contexto da IA | ✅ |
| Calendário letivo e contexto institucional editáveis pelo admin | ✅ |
| Instalação pela própria aplicação, sem ferramenta local | ✅ |
| Feedback útil/não útil por resposta | ✅ |
| Limite de perguntas por usuário | ✅ |

Fora do escopo desta entrega (mas com o banco e a arquitetura já preparados):
tela de Calendário, sincronização com Google Drive, automação de
lembretes por e-mail, relatórios, troca de senha pelo próprio usuário e o
[cadastro em massa de usuários](./docs/cadastro-em-massa.md) — este último já
com o plano de implementação escrito.

**Como publicar:** o passo a passo de Supabase e Vercel está em
[DEPLOY.md](./DEPLOY.md).

**Para testar a ingestão:** há dez PDFs fictícios em
[`documentos-exemplo/`](./documentos-exemplo/), com papel timbrado, número,
data e destinatário. Cada um exercita uma dificuldade diferente da extração de
datas, e dois são restritos ao corpo docente para conferir o recorte de acesso.
O que perguntar depois de subi-los está no README daquela pasta.

---

## Rodando localmente

> Para publicar direto na Vercel, sem instalar nada, siga o
> [DEPLOY.md](./DEPLOY.md). Esta seção é só para quem quer desenvolver.

Você precisa de **Node 20+** e um **Postgres com a extensão `pgvector`**
(o Supabase já vem com ela).

```bash
npm install
cp .env.example .env.local     # preencha DATABASE_URL, SESSION_SECRET e OPENAI_API_KEY
npm run db:migrate             # cria o schema, a extensão e os índices
npm run db:seed                # cria os usuários e o acervo de demonstração
npm run dev
```

Abra <http://localhost:3000>. Os cartões de acesso rápido na tela de login
permitem alternar entre os perfis sem digitar senha.

| Matrícula | Perfil | Contexto |
|---|---|---|
| `2026074` | Aluno / Responsável | 7º ano · Fundamental II |
| `2026112` | Aluno / Responsável | 2ª série · Ensino Médio |
| `P1042` | Professor | Matemática e Física · 7º ao 9º ano |
| `ADM001` | Administrador | Acesso total + ingestão, usuários e whitelabel |

Senha de todos: o valor de `SEED_PASSWORD` (padrão `santadoroteia`).

### Sem chave da OpenAI

O sistema **não quebra**: entra em *modo demonstração*, com embeddings
determinísticos locais, classificação por regras e resposta extrativa (sem
geração de linguagem, sem OCR). Serve para navegar pelas telas. Ao configurar a
chave, rode `npm run db:seed` de novo para reindexar o acervo com embeddings
reais — os dois tipos de vetor não são comparáveis entre si.

### Conferindo que o controle de acesso funciona

```bash
npx tsx scripts/verify.ts
```

Verifica, contra o banco semeado, que o aluno não alcança o documento restrito
ao corpo docente (nem pela listagem, nem pela busca da IA, nem pela agenda), que
documentos vencidos saem do acervo, que o recorte por série funciona, que a
busca híbrida acha tanto por sentido quanto por número de comunicado, e que a
agenda só devolve eventos futuros já validados por um humano.

---

## Como está montado

```
Next.js 16 (App Router)  ── UI + rotas de API, tudo no mesmo deploy
        │
        ├── lib/ingest/    extrair → classificar → fatiar → embutir
        ├── lib/rag/       busca híbrida + montagem do prompt + resposta
        ├── lib/ai/        única fronteira com o provedor de IA
        └── lib/db/        Drizzle ORM sobre Postgres + pgvector
```

### O caminho de um documento

1. **Extração** (`lib/ingest/extract.ts`) — texto nativo do PDF via `unpdf`.
   Se a densidade de texto por página for baixa demais, o arquivo é tratado
   como digitalizado e vai para OCR no modelo multimodal. DOCX via `mammoth`,
   XLSX via `exceljs`, CSV com o cabeçalho repetido em cada linha para que todo
   trecho recuperado continue interpretável sozinho.

2. **Classificação e datas** (`lib/ingest/classify.ts`) — **uma única** chamada
   com saída estruturada (JSON Schema estrito) devolve metadados *e* eventos.
   Juntar as duas tarefas corta o custo pela metade e evita que a classificação
   e a extração de datas discordem sobre o mesmo documento.

   O prompt é explícito sobre o erro mais caro: **nunca extrair a data de
   emissão do documento**, só datas de coisas que vão acontecer. Cada evento
   traz uma confiança e o trecho literal que o originou; abaixo de `0.75` ele
   entra como `a_revisar` em vez de ir direto para o calendário.

3. **Fatiamento** (`lib/ingest/chunk.ts`) — ~3.000 caracteres com 350 de
   sobreposição, quebrando em parágrafo e depois em frase. A sobreposição existe
   para que uma data não caia exatamente na fronteira entre dois trechos.

4. **Embedding** — cada trecho é prefixado com um cabeçalho de contexto
   (`[Cronograma de provas · nº 231 · … · 7º ano]`) antes de virar vetor, o que
   melhora muito a recuperação de trechos do meio do documento.

### O caminho de uma pergunta

```
pergunta → planejar → [esclarecer?] → buscar (documentos + agenda) → responder
```

1. **Planejar** (`lib/rag/plan.ts`) — uma chamada pequena que faz duas coisas:

   - **Reescreve** a pergunta como consulta autônoma. "E a de história?" não
     recupera nada, porque não tem sujeito; vira "prova de história do 7º ano na
     3ª etapa", que recupera. Sem isso, toda pergunta de acompanhamento falha.
   - **Decide se vale perguntar de volta.** O padrão é *não* perguntar: o
     sistema já sabe papel, série e disciplinas, e perguntar o que já se sabe é
     atrito. Quando há mais de uma leitura possível, ele escolhe a mais
     provável e **declara a suposição** na resposta ("Considerando a 3ª etapa,
     que é a atual: …"), o que deixa a pessoa corrigir sem ter sido interrogada.
     Só quando as leituras levam a respostas incompatíveis é que ele pergunta —
     uma pergunta curta, com até 4 opções clicáveis.

   O planejador é uma otimização, não um requisito: se a chamada falhar, a busca
   usa a pergunta como veio.

2. **Buscar** — a busca híbrida abaixo, mais a agenda estruturada quando a
   pergunta é de data.

3. **Responder** — com as citações e, se houver, a suposição declarada.

### Ciclo de vida da conversa

A thread acompanha a aba: ir ao perfil e voltar, ou dar um F5, retoma a conversa
com as mensagens de volta na tela — o servidor guarda o histórico e o cliente
guarda o id em `sessionStorage`. Fechar a aba encerra.

O servidor também aposenta uma thread parada há mais de
`CONVERSATION_IDLE_HOURS` (24 por padrão): a pergunta de hoje não é continuação
da conversa de ontem.

Dentro de uma conversa em andamento, o encadeamento **não é cortado** num número
fixo de turnos — é o que a pessoa espera ao dizer "e a de história?" cinco
perguntas depois. Há apenas um teto de segurança por volume de texto, para uma
conversa muito longa não crescer sem fim.

### A agenda complementa os documentos, não os substitui

Perguntas de "quando" são as mais frequentes, e `lib/rag/events.ts` monta um
índice de datas a partir de `document_events`, já filtrado por série e vigência,
cortando o passado e ordenando no banco.

Mas **os documentos são sempre consultados**, inclusive nas perguntas de data. A
agenda é um atalho para ordenar e não deixar passar nada; ela pode estar
incompleta, porque só contém o que a extração pegou e um humano validou. Uma
data que aparece só no texto do documento vale do mesmo jeito.

Só entram eventos com `review = 'ativo'`. O que a IA extraiu com confiança baixa
fica em `a_revisar` e **não é apresentado como fato** até alguém conferir.

### A busca é híbrida, de propósito

`lib/rag/retrieve.ts` roda várias buscas em paralelo e funde as listas com
Reciprocal Rank Fusion (k = 60):

- **vetorial** (`pgvector`, cosseno, índice HNSW) — uma lista por formulação da
  pergunta. Entende *"quando é a prova de matemática?"* e sinônimos, mas erra
  *"Comunicado 112"*;
- **lexical estrita** (`websearch_to_tsquery`, que une os termos com AND) —
  acerta o código exato, mas devolve zero assim que a consulta cresce;
- **lexical ampla** (os mesmos radicais unidos por OR, ordenados por
  `ts_rank`) — sobrevive à consulta longa que o planejador produz; casar mais
  termos sobe na lista.

Elas falham em situações opostas. O RRF combina por posição, sem precisar
calibrar pesos entre escalas de score incompatíveis: um trecho bem colocado em
duas listas ganha do primeiro colocado de uma só.

**Várias formulações da mesma pergunta.** O planejador devolve até duas
reescritas com o vocabulário que o documento provavelmente usa — *"o que cai na
prova"* vira também *"conteúdos programáticos da avaliação"*. Elas saem na mesma
chamada em que ele já reescreve a consulta, então não custam nenhuma ida a mais
ao modelo: só um lote de embeddings, que é a parte barata.

**O orçamento é adaptativo, não um número fixo de trechos.** O planejador
classifica a pergunta como `foco` (uma data, uma regra — o caso comum) ou
`amplo` (*"todos os prazos do semestre"*, onde a resposta só está certa se for
completa). Daí saem os limites:

| | candidatos | trechos | caracteres |
|---|---|---|---|
| `foco` | 30 por lista | até 12 | 14.000 |
| `amplo` | 60 por lista | até 30 | 26.000 |

A seleção é gulosa em duas passadas: a primeira limita quantos trechos cada
documento pode ocupar (senão um calendário anual longo toma o prompt inteiro e a
resposta fica cega para os outros documentos); a segunda gasta a sobra sem esse
limite, porque quando só existe um documento relevante o certo é aprofundar
nele.

**Expansão de contexto.** Escolhidos os trechos, uma última consulta traz os
**vizinhos imediatos** (`ordinal ± 1`) dos mesmos documentos, dentro dos 30% do
orçamento reservados para isso. Uma tabela de cronograma quase sempre cruza a
fronteira entre dois trechos — o cabeçalho num, as datas no outro —, e recuperar
o trecho certo e ainda assim responder errado por falta do vizinho é o modo de
falha mais difícil de diagnosticar, porque a busca *parece* ter funcionado.

O contexto final vai ordenado por documento (o mais relevante primeiro) e, dentro
de cada um, na ordem do texto: intercalar trechos de documentos diferentes por
score puro dá ao modelo um contexto picotado e mais difícil de citar.

O índice lexical usa uma configuração própria, `portuguese_unaccent`, que passa
o `unaccent` antes do radicalizador (migração `0004`). Sem ela a busca era
sensível a acento — *"recuperacao"* digitado no celular não encontrava
*"recuperação"* no documento, e a metade lexical simplesmente não contribuía.

`npm run busca` mostra, para cada perfil, o que um conjunto de perguntas reais
recupera e em que posição. É a forma mais rápida de responder à pergunta que
importa antes de julgar a redação da resposta: **o trecho certo chegou ao
prompt?**

### Controle de acesso

Existe **um** lugar que decide quem vê o quê: `documentVisibilityFilter()` em
`lib/rag/access.ts`. Ele é aplicado na listagem, na busca da IA **e** no
download do arquivo original.

Isso é o que sustenta a promessa da tela de ingestão: um aluno não consegue
extrair pelo chat um documento que não poderia abrir na lista, porque o recorte
acontece dentro do `SELECT` — os trechos proibidos nunca chegam ao prompt. O
download por URL direta devolve **404** (e não 403) para quem não tem acesso:
saber o id de um documento não é evidência de que ele existe.

**Classificar não é restringir.** A série e o segmento que a IA deduz são
metadado: entram no cabeçalho do trecho, na tela de Documentos e na ordenação da
busca, mas não escondem nada. O erro do classificador para os dois lados, e o
erro caro é o de esconder — um comunicado geral que menciona o 7º ano de
passagem sumiria para o resto da escola, e ninguém descobriria, porque a pessoa
só receberia "não encontrei".

Restringe quem a administração marcar explicitamente no upload (*"exibir somente
para essas séries e segmentos"*, coluna `restrict_to_scope`), e a marca só fica
disponível depois que a série é escolhida à mão — restringir ao palpite do
modelo seria o mesmo problema pela porta dos fundos.

O **público-alvo** (aluno / professor / coordenação) é diferente: restringe
sempre. Ali a escolha é humana e deliberada, e um documento marcado como "só
corpo docente" é exatamente isso.

Para a classificação não deixar de valer, ela virou **ordenação**: um documento
da série de quem pergunta sobe 25% na fusão, um de outra série desce 20%. O
aluno do 7º ano alcança o cronograma do 9º se precisar, mas vê o dele primeiro.

### Whitelabel

A identidade visual fica em `tenants.branding` (jsonb) e é traduzida para CSS
variables em `lib/branding.ts`, aplicadas no elemento raiz do grupo `(app)`.
Como o tema inteiro já é escrito em cima dessas variáveis, mudar a cor principal
repinta botões, links, chips e estados ativos de uma vez — sem classe
condicional espalhada pelos componentes.

Duas decisões que valem explicar:

- **Cores são validadas como `#RRGGBB` no servidor.** Elas viram CSS aplicado na
  árvore inteira; aceitar string livre de um formulário seria aceitar CSS
  arbitrário.
- **Tipografia é preset, não campo livre.** As famílias precisam estar
  pré-carregadas para não causar troca de fonte visível, e cada combinação já foi
  conferida quanto a peso, legibilidade e acentuação do português.

O logo é servido por `/api/tenant/logo?v=<hash>`, que funciona igual nos dois
drivers de storage (o bucket do Supabase é privado e o disco local não tem URL
pública). O `v` muda a cada troca de arquivo, o que invalida o cache do
navegador.

### Contexto do usuário

O contexto é **deliberadamente curto**, e nada nele é editável pela própria
pessoa:

- **Aluno / responsável:** nome e série. Só isso. O acesso ao acervo é recortado
  pela série, então deixá-la editável pelo próprio usuário seria entregar a
  chave do cofre.
- **Professor:** disciplinas e séries em que dá aula (vazio para polivalente do
  Fundamental I). Não amplia acesso — professor já enxerga todas as séries —,
  só diz à IA com quem ela fala.

Tudo é mantido em **Administração → Usuários**. A tela **Meu perfil** existe
para transparência: mostra exatamente o que o assistente sabe, sem nenhum campo
editável.

A série é gravada junto com o ano letivo em que vale, e a série **vigente** é
derivada da data (`lib/series-progression.ts`). Quem entrou como 7º ano em 2026
é tratado como 8º ano em 2027, sem rotina agendada — o banco guarda o fato
original, que é auditável, e a série atual é uma consequência do calendário.

Como a sessão lê o usuário do banco a cada requisição, uma correção na secretaria
vale na hora, sem esperar o cookie expirar.

### Data e etapa

O colégio trabalha com três etapas (trimestres). O assistente recebe a data de
hoje e a etapa vigente (`lib/academic-calendar.ts`), o que resolve "a próxima
prova" ou "esta etapa" sem precisar perguntar. O prompt é explícito em **não**
restringir a resposta à etapa atual por conta própria: se um documento de outra
etapa responde à pergunta, ele deve ser usado, dizendo a que etapa se refere.

As datas de corte das etapas estão em variável de ambiente
(`ACADEMIC_ETAPA_ENDS`) porque são um palpite — confirme com a secretaria.

### Vigência

Todo documento tem uma janela de validade. A IA deduz a janela do próprio
documento (um cronograma da 1ª etapa deixa de valer quando a etapa acaba); o
administrador pode sobrescrever no envio; e, se nada for definido, vale o padrão
de `DEFAULT_RETENTION_MONTHS` (12). Fora da janela o documento **continua no
acervo para auditoria, mas deixa de ser fonte para o assistente** — é por isso
que o filtro de vigência está na consulta, e não num job de exclusão.

---

## Escolhas de modelo e custo

Modelos configuráveis por variável de ambiente, sem tocar no código:

A decisão que manda aqui é uma assimetria: **a ingestão roda uma vez por
documento; o chat roda dezenas de milhares de vezes por mês.** Um erro na
extração vira dado errado no banco e contamina toda resposta futura — então ali
vale pagar mais. No chat, o trabalho difícil (achar o trecho certo) já foi feito
pela busca, e o modelo só precisa redigir sem inventar.

| Papel | Padrão | Por quê |
|---|---|---|
| Chat | `gpt-4.1-mini` | Segue instrução com rigor ("só use as fontes"), que importa mais aqui do que capacidade de raciocínio. |
| Planejador | `gpt-4.1-mini` | Tarefa pequena e estruturada, mas roda a cada pergunta: é onde o modelo barato mais rende. |
| Classificação/datas | `gpt-4.1` | Modelo maior de propósito, pelo argumento acima. Como roda uma vez por documento, o custo é marginal. |
| OCR | `gpt-4.1-mini` | Multimodal, evita manter um Tesseract e lida melhor com tabela digitalizada. |
| Embeddings | `text-embedding-3-small` | 1536 dimensões, bem mais barato que o `large` com perda pequena de recall no português. |

Todos são trocáveis por variável de ambiente. Se quiser cortar mais, o caminho é
o `nano` no planejador — não no chat, onde a fidelidade à fonte é o produto.

**Estimativa mensal para o volume do documento de escopo** (17 mil perguntas/mês,
430 PDFs iniciais):

| Item | Estimativa |
|---|---|
| Chat — 17k perguntas × ~4k tokens de entrada + ~400 de saída | US$ 25 – 40 |
| Planejador — 17k chamadas × ~700 tokens | US$ 3 – 6 |
| Ingestão inicial — 430 PDFs com `gpt-4.1` na classificação | US$ 25 – 45, uma vez |
| Ingestão corrente — ~40 documentos/mês | US$ 3 – 6 |
| **IA, por mês, em regime** | **≈ US$ 35 – 55** |

> **Confira os preços antes de fechar o orçamento.** Estes números vêm do meu
> conhecimento de treinamento e a tabela da OpenAI muda. Use
> <https://openai.com/api/pricing> como fonte. A estrutura de consumo
> (quantidade de chamadas e tokens por chamada) é o que este projeto define e
> está correta; o preço por token, confirme.

Três alavancas de custo, já previstas na arquitetura:

- o cabeçalho de contexto por trecho permite baixar de 8 para 5 os trechos
  enviados sem perder qualidade;
- o **cache de prompt** da OpenAI corta boa parte do custo de entrada quando o
  prefixo do sistema se repete — e aqui ele se repete a cada pergunta; vale
  ativar quando o volume subir;
- a agenda estruturada responde perguntas de data com uma lista curta em vez de
  tabelas inteiras, o que já reduz os tokens de entrada nas perguntas mais
  frequentes.

Infraestrutura: **Vercel Pro ~US$ 20/mês** + **Supabase Pro ~US$ 25/mês** cobrem
com folga 3.800 alunos e o acervo de 113 MB.

---

## Deploy (Vercel + Supabase)

1. Crie o projeto no Supabase e ligue a extensão `vector`
   (o `npm run db:migrate` já faz isso, mas precisa da **conexão direta**, porta
   5432).
2. Crie o bucket de storage (padrão: `documentos`).
3. Rode as migrações e o seed apontando para o Supabase.
4. Importe o repositório na Vercel e configure as variáveis de ambiente:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | **Transaction pooler**, porta **6543** (o código detecta a porta e desliga prepared statements) |
   | `SESSION_SECRET` | `openssl rand -base64 32` |
   | `OPENAI_API_KEY` | sua chave |
   | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | obrigatórias: o disco da Vercel é somente leitura |
   | `ENABLE_DEMO_LOGIN` | **não defina** (ou `false`) — ver abaixo |

### Antes de ir para produção

Itens deliberadamente simplificados no protótipo, cada um com o lugar exato onde
mexer:

- **Acesso rápido sem senha** — os cartões da tela de login entram em qualquer
  perfil sem credencial. Ficam desligados automaticamente quando
  `NODE_ENV=production`, e só voltam com `ENABLE_DEMO_LOGIN=true`. A checagem é
  feita **no servidor** (`lib/auth/demo.ts`), não só na interface.
- **Sessão** — cookie `httpOnly` com JWT que carrega **apenas o id**; papel,
  série e situação são lidos do banco a cada requisição (`lib/auth/session.ts`),
  então desativar alguém ou corrigir a série vale na hora. Falta revogação
  explícita e refresh: para produção, migrar para o Supabase Auth (GoTrue) e
  usar o `password_hash` só como caminho de migração.
- **Row Level Security** — o acesso é garantido na camada de consulta. Como
  defesa em profundidade, vale replicar as regras em políticas RLS no Postgres,
  para que um bug de query não vire vazamento.
- **Ingestão síncrona** — cada arquivo é processado dentro da requisição
  (`maxDuration = 300`, que exige **Vercel Pro**; no plano Hobby o limite é 60s
  e PDFs grandes vão estourar). Para os 430 PDFs do acervo histórico, mover para
  uma fila (Inngest, QStash ou Supabase Queues) — a função `ingestDocument()` já
  é uma unidade de trabalho isolada e idempotente por checksum.
- **Rate limiting** — há um limite por usuário (`lib/rate-limit.ts`, padrão 20
  perguntas / 10 min), contando mensagens no banco em vez de manter estado em
  memória, que não sobreviveria a várias instâncias serverless. Protege contra
  uso acidental em excesso e contra uma conta comprometida queimar a cota da
  OpenAI; **não** é proteção contra ataque distribuído — para isso, use o
  firewall da Vercel.
- **`npm audit`** — duas advertências moderadas, ambas em dependências de
  desenvolvimento (`esbuild` dentro do `drizzle-kit`; `uuid` dentro do
  `exceljs`, num caminho de código que não usamos). Corrigir exigiria downgrades
  que quebram a API; não afetam o runtime de produção.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:migrate` | Aplica os `.sql` de `drizzle/` em ordem |
| `npm run db:seed` | Recria usuários e acervo de demonstração |
| `npm run setup` | `db:migrate` + `db:seed` |
| `npm run busca` | Sonda de recuperação: o que cada perfil recupera, e em que posição |
| `npm run verify` | Roda as três verificações abaixo, em ordem |
| `npx tsx scripts/verify-env.ts` | Confere que variável vazia cai no padrão (não precisa de banco) |
| `npx tsx scripts/verify-render.tsx` | Confere o renderizador de markdown do chat |
| `npx tsx scripts/verify.ts` | Confere acesso por perfil, vigência, busca e agenda |
| `npm run typecheck` | `tsc --noEmit` |
