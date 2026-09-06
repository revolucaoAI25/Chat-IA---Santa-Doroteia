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
| IA contextualizada por quem pergunta (série, turma, papel) | ✅ |
| Ingestão de PDF, DOCX, CSV, XLSX, TXT e imagens | ✅ |
| OCR para digitalizações e imagens (via modelo multimodal) | ✅ |
| Classificação automática: tipo, segmento, série, ano letivo, vigência | ✅ |
| Extração automática de datas de provas/eventos + fila de revisão humana | ✅ |
| Recorte de acesso por série/segmento/papel — inclusive no que a IA busca | ✅ |
| Vigência de documentos (expiram e deixam de ser fonte) | ✅ |
| Deduplicação por checksum | ✅ |
| Telemetria de tokens/latência por resposta | ✅ |

Fora do escopo desta entrega (mas com o banco e a arquitetura já preparados):
telas de Documentos e Calendário, sincronização com Google Drive, automação de
lembretes por e-mail, relatórios e a aba de Whitelabel.

---

## Rodando localmente

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
| `2026074` | Aluno / Responsável | 7º ano · Fundamental II · Turma 7A |
| `2026112` | Aluno / Responsável | 2ª série · Ensino Médio |
| `P1042` | Professor | Enxerga todas as séries |
| `ADM001` | Administrador | Acesso total + tela de ingestão |

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
ao corpo docente (nem pela listagem, nem pela busca da IA), que documentos
vencidos saem do acervo, que o recorte por série funciona e que a busca híbrida
acha tanto por sentido quanto por número de comunicado.

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

### A busca é híbrida, de propósito

`lib/rag/retrieve.ts` roda **duas** buscas e funde os resultados com
Reciprocal Rank Fusion:

- **vetorial** (`pgvector`, cosseno, índice HNSW) — entende *"quando é a prova
  de matemática?"*, mas erra *"Comunicado 112"*;
- **textual** (`tsvector` em português, índice GIN) — acerta o código exato e
  ignora sinônimos.

As duas falham em situações opostas. O RRF combina as listas por posição, sem
precisar calibrar pesos entre escalas de score incompatíveis.

### Controle de acesso

Existe **um** lugar que decide quem vê o quê: `documentVisibilityFilter()` em
`lib/rag/access.ts`. Ele é aplicado na listagem, na busca da IA **e** no
download do arquivo original.

Isso é o que sustenta a promessa da tela de ingestão: um aluno não consegue
extrair pelo chat um documento que não poderia abrir na lista, porque o recorte
acontece dentro do `SELECT` — os trechos proibidos nunca chegam ao prompt. O
download por URL direta devolve **404** (e não 403) para quem não tem acesso:
saber o id de um documento não é evidência de que ele existe.

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

| Papel | Padrão | Por quê |
|---|---|---|
| Chat | `gpt-4.1-mini` | Segue instrução bem (crítico para "só use as fontes") a uma fração do custo do modelo grande. |
| Classificação/datas | `gpt-4.1-mini` | Temperatura 0 + JSON Schema estrito. A tarefa é de extração, não de raciocínio aberto. |
| OCR | `gpt-4.1-mini` | Multimodal, evita manter um Tesseract e lida melhor com tabela digitalizada. |
| Embeddings | `text-embedding-3-small` | 1536 dimensões, ~5x mais barato que o `large` com perda pequena de recall no português. |

**Estimativa mensal para o volume do documento de escopo** (17 mil perguntas/mês,
430 PDFs iniciais). Ordem de grandeza para orçamento, não cotação:

| Item | Estimativa |
|---|---|
| Chat — 17k perguntas × ~4k tokens de entrada + ~400 de saída | US$ 25 – 40 |
| Ingestão inicial — 430 PDFs (extração + classificação + embeddings) | US$ 8 – 15, uma vez |
| Ingestão corrente — ~40 documentos/mês | US$ 1 – 3 |
| **IA, por mês, em regime** | **≈ US$ 30 – 45** |

Duas alavancas grandes de custo, já previstas na arquitetura: o cabeçalho de
contexto por trecho permite reduzir de 8 para 5 os trechos enviados sem perder
qualidade; e o cache de prompt da OpenAI corta ~50% da entrada quando o prefixo
do sistema se repete — vale ativar quando o volume subir.

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
- **Sessão** — JWT assinado em cookie `httpOnly` (`lib/auth/session.ts`). Não há
  revogação nem refresh; para produção, migrar para o Supabase Auth (GoTrue) e
  usar o `password_hash` só como caminho de migração.
- **Row Level Security** — o acesso é garantido na camada de consulta. Como
  defesa em profundidade, vale replicar as regras em políticas RLS no Postgres,
  para que um bug de query não vire vazamento.
- **Ingestão síncrona** — cada arquivo é processado dentro da requisição
  (`maxDuration = 300`, que exige **Vercel Pro**; no plano Hobby o limite é 60s
  e PDFs grandes vão estourar). Para os 430 PDFs do acervo histórico, mover para
  uma fila (Inngest, QStash ou Supabase Queues) — a função `ingestDocument()` já
  é uma unidade de trabalho isolada e idempotente por checksum.
- **Rate limiting** — não há. Antes de abrir para 3.800 alunos, limitar
  `/api/chat` por usuário.
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
| `npx tsx scripts/verify.ts` | Confere acesso por perfil, vigência e busca |
| `npm run typecheck` | `tsc --noEmit` |
