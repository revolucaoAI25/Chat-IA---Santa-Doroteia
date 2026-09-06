# Como conectar ao Supabase e à Vercel

Passo a passo, na ordem. Leva ~20 minutos na primeira vez.

---

## Parte 1 — Supabase (banco + arquivos)

### 1.1 Criar o projeto

1. Entre em <https://supabase.com> e crie uma conta (o plano gratuito já roda o protótipo).
2. **New project**. Preencha:
   - **Name**: `santa-doroteia`
   - **Database Password**: gere uma senha forte e **guarde** — ela aparece na string de conexão e o Supabase não mostra de novo.
   - **Region**: `South America (São Paulo)` — é a mais próxima do colégio e corta ~150 ms de latência por consulta.
3. Aguarde o provisionamento (~2 min).

### 1.2 Ligar a extensão pgvector

O `npm run db:migrate` já roda `CREATE EXTENSION vector`, mas o Supabase pede que ela esteja habilitada no projeto:

1. Menu lateral → **Database** → **Extensions**.
2. Busque `vector` e ative.

### 1.3 Pegar as duas strings de conexão

Menu lateral → **Project Settings** → **Database** → seção **Connection string**.

Você precisa de **duas**, e a diferença importa:

| Uso | Qual pegar | Porta |
|---|---|---|
| Migrações e seed (da sua máquina) | **Direct connection** | `5432` |
| Aplicação na Vercel | **Transaction pooler** | `6543` |

O motivo: funções serverless abrem e fecham conexões o tempo todo e esgotariam o Postgres; o pooler resolve isso, mas não suporta *prepared statements*. O código detecta a porta `6543` e desliga esse recurso sozinho — por isso basta usar a string certa em cada lugar.

Substitua `[YOUR-PASSWORD]` pela senha do passo 1.1.

### 1.4 Criar o bucket de arquivos

1. Menu lateral → **Storage** → **New bucket**.
2. Nome: `documentos`. Deixe **Private** (o app serve os arquivos por rota autenticada; bucket público vazaria os PDFs).
3. **Save**.

### 1.5 Pegar as chaves da API

**Project Settings** → **API Keys**:

- **Project URL** → vira `SUPABASE_URL`
- **service_role** (em *Secret keys*) → vira `SUPABASE_SERVICE_ROLE_KEY`

> A `service_role` ignora RLS e vale como acesso total ao banco. Ela só pode existir em variável de ambiente do servidor — nunca no código, nunca em variável `NEXT_PUBLIC_*`, nunca no navegador.

### 1.6 Rodar as migrações e o seed

Da sua máquina, com a **conexão direta** (5432):

```bash
cp .env.example .env.local
```

Preencha no `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.xxxxx.supabase.co:5432/postgres
SESSION_SECRET=<cole o resultado de: openssl rand -base64 32>
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Depois:

```bash
npm install
npm run db:migrate      # cria tabelas, extensão e índices
npm run db:seed         # cria usuários e o acervo de demonstração
npx tsx scripts/verify.ts   # confere o controle de acesso
```

Se `verify.ts` terminar com "Todas as verificações passaram", o banco está pronto.

---

## Parte 2 — Vercel (aplicação)

### 2.1 Subir o código para o GitHub

O repositório já está em `revolucaoAI25/Chat-IA---Santa-Doroteia`, na branch de desenvolvimento. Faça o merge para a branch principal quando quiser publicar.

### 2.2 Importar na Vercel

1. Entre em <https://vercel.com> com a conta do GitHub.
2. **Add New** → **Project** → selecione o repositório.
3. A Vercel detecta Next.js sozinha. **Não mude** Build Command nem Output Directory.
4. **Não clique em Deploy ainda** — configure as variáveis primeiro (o build falha sem `DATABASE_URL`).

### 2.3 Variáveis de ambiente

Ainda na tela de import, abra **Environment Variables** e adicione:

| Nome | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | string do **Transaction pooler** | porta **6543**, não 5432 |
| `SESSION_SECRET` | `openssl rand -base64 32` | pode ser diferente da local |
| `OPENAI_API_KEY` | sua chave | |
| `SUPABASE_URL` | Project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role | |
| `SUPABASE_STORAGE_BUCKET` | `documentos` | |
| `DEFAULT_RETENTION_MONTHS` | `12` | |

**Não** defina `ENABLE_DEMO_LOGIN`. Ausente, o acesso rápido sem senha fica desligado em produção — que é o comportamento correto.

Marque as três caixas (Production, Preview, Development) em cada variável.

### 2.4 Deploy

Clique em **Deploy**. O primeiro build leva ~2 minutos. No fim você recebe uma URL `*.vercel.app`.

### 2.5 Escolher o plano

O **Hobby** (grátis) funciona para demonstrar, com uma limitação real: funções serverless têm teto de **60 segundos**. A ingestão faz OCR e classificação dentro da requisição e pede até 300 s (`maxDuration` em `app/api/ingest/route.ts`), então **PDFs grandes ou digitalizados vão estourar o tempo no Hobby**.

O **Pro** (US$ 20/mês) libera os 300 s e resolve para o uso normal. Para carregar os 430 PDFs do acervo histórico de uma vez, o certo mesmo é mover a ingestão para uma fila — veja "Antes de ir para produção" no README.

### 2.6 Domínio próprio

**Project Settings** → **Domains** → **Add**. Aponte no seu provedor de DNS:

- subdomínio (`assistente.santadoroteia.com.br`): registro `CNAME` para `cname.vercel-dns.com`
- domínio raiz: registro `A` para o IP que a Vercel indicar na tela

O HTTPS é emitido automaticamente depois que o DNS propaga.

---

## Parte 3 — Conferir que subiu certo

1. Abra a URL e confirme que a tela de login aparece **sem** os cartões de acesso rápido (prova de que o modo demonstração está desligado).
2. Entre com `ADM001` e a senha do seed.
3. **Administração → Ingestão**: suba um PDF de verdade e veja a classificação.
4. **Assistente**: pergunte algo sobre esse documento e confira a citação.
5. **Administração → Whitelabel**: suba o logo oficial e ajuste as cores.

### Se algo falhar

| Sintoma | Causa provável |
|---|---|
| `DATABASE_URL não está definida` no build | Variável não foi marcada para o ambiente **Production** |
| `password authentication failed` | A senha na string ainda está como `[YOUR-PASSWORD]` |
| `type "vector" does not exist` | Extensão não habilitada (passo 1.2) ou migração rodada no pooler em vez da conexão direta |
| Ingestão dá timeout | Plano Hobby (teto de 60 s) — veja 2.5 |
| Logo não aparece | `SUPABASE_URL`/`SERVICE_ROLE_KEY` ausentes: sem elas o app grava em disco local, que na Vercel é somente leitura |
| Erro de conexão intermitente sob carga | `DATABASE_URL` está na porta 5432; troque pelo pooler (6543) |

---

## Parte 4 — Depois de publicar

- **Trocar as senhas do seed.** Todos os usuários de demonstração compartilham a mesma senha. Antes de dar acesso a alguém de verdade, troque-as.
- **Backups.** O Supabase Pro faz backup diário automático. No plano gratuito, não há — vale exportar manualmente se o acervo já for real.
- **Limite de gastos na OpenAI.** Em <https://platform.openai.com/settings/organization/limits>, defina um teto mensal. É a proteção mais simples contra um erro de laço custar caro.
- **Monitoramento.** A aba **Logs** da Vercel mostra os erros das rotas de API; o **Logs Explorer** do Supabase mostra as consultas lentas.
