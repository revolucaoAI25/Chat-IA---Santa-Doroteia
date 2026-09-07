-- GERADO POR scripts/bundle-migrations.ts — NÃO EDITE À MÃO.
-- A fonte da verdade são os arquivos em drizzle/*.sql.
--
-- Todas as migrações do projeto, na ordem, num arquivo só.
-- Para aplicar: Supabase -> SQL Editor -> New query -> colar tudo -> Run.
-- É idempotente: rodar de novo num banco já atualizado não faz nada.

-- ==========================================================================
-- 0000_init.sql
-- ==========================================================================

-- Esquema inicial do assistente institucional.
-- Idempotente: pode ser reaplicado sem quebrar um banco já migrado.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

/* ---------------------------------------------------------------- enums -- */

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('aluno', 'professor', 'coordenacao', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE segment AS ENUM ('educacao_infantil', 'fundamental_i', 'fundamental_ii', 'ensino_medio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'autorizacao', 'bilhete', 'circular', 'comunicado', 'conteudo_avaliacao',
    'convite', 'cronograma_provas', 'lista_material', 'prova', 'recuperacao',
    'calendario', 'regulamento', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ingestion_status AS ENUM (
    'pending', 'extracting', 'classifying', 'embedding', 'ready', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('prova', 'recuperacao', 'simulado', 'evento', 'entrega');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_review AS ENUM ('a_revisar', 'ativo', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* -------------------------------------------------------------- tenants -- */

CREATE TABLE IF NOT EXISTS tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  logo_url     text,
  favicon_url  text,
  branding     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

/* ---------------------------------------------------------------- users -- */

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matricula     text NOT NULL,
  email         text NOT NULL,
  name          text NOT NULL,
  role          user_role NOT NULL,
  password_hash text NOT NULL,
  segment       segment,
  serie         text,
  turma         text,
  extra_series  text[] NOT NULL DEFAULT '{}'::text[],
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_matricula_idx ON users (tenant_id, matricula);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx     ON users (tenant_id, email);

/* ------------------------------------------------------------ documents -- */

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  doc_number    integer,
  type          document_type NOT NULL DEFAULT 'outro',
  summary       text,
  segments      segment[] NOT NULL DEFAULT '{}'::segment[],
  series        text[] NOT NULL DEFAULT '{}'::text[],
  etapa         text,
  ano_letivo    integer,
  valid_from    date,
  valid_until   date,
  audience      user_role[] NOT NULL DEFAULT '{}'::user_role[],
  source_kind   text NOT NULL DEFAULT 'upload',
  source_ref    text,
  storage_path  text,
  mime_type     text,
  byte_size     integer,
  checksum      text,
  page_count    integer,
  used_ocr      boolean NOT NULL DEFAULT false,
  status        ingestion_status NOT NULL DEFAULT 'pending',
  status_detail text,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_status_idx ON documents (tenant_id, status);
CREATE INDEX IF NOT EXISTS documents_type_idx          ON documents (type);
CREATE INDEX IF NOT EXISTS documents_valid_until_idx   ON documents (valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS documents_tenant_checksum_idx ON documents (tenant_id, checksum);

/* ------------------------------------------------------ document_chunks -- */

CREATE TABLE IF NOT EXISTS document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ordinal        integer NOT NULL,
  page           integer,
  content        text NOT NULL,
  context_header text,
  token_count    integer,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Coluna gerada: mantém o índice lexical sempre em sincronia com o conteúdo,
-- sem trigger e sem risco de esquecer de atualizar na escrita.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS chunks_document_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx      ON document_chunks USING gin (content_tsv);

-- HNSW para similaridade de cosseno: recall melhor que IVFFlat e sem etapa de
-- treino, o que importa porque o acervo cresce de forma incremental.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

/* ------------------------------------------------------ document_events -- */

CREATE TABLE IF NOT EXISTS document_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title           text NOT NULL,
  type            event_type NOT NULL,
  starts_on       date NOT NULL,
  ends_on         date,
  starts_at_time  text,
  subject         text,
  chamada         integer,
  segments        segment[] NOT NULL DEFAULT '{}'::segment[],
  series          text[] NOT NULL DEFAULT '{}'::text[],
  review          event_review NOT NULL DEFAULT 'a_revisar',
  confidence      text,
  source_excerpt  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_tenant_date_idx ON document_events (tenant_id, starts_on);
CREATE INDEX IF NOT EXISTS events_document_idx    ON document_events (document_id);

/* -------------------------------------------------------- conversations -- */

CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              text NOT NULL,
  content           text NOT NULL,
  citations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer,
  model             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

/* ------------------------------------------------------- ingestion_jobs -- */

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  status      ingestion_status NOT NULL DEFAULT 'pending',
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  started_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ==========================================================================
-- 0001_context_branding_feedback.sql
-- ==========================================================================

-- Contexto acadêmico mais rico por usuário, identidade visual por tenant e
-- feedback por resposta. Idempotente.

/* ------------------------------------------------ contexto do usuário ---- */

-- Para professores e coordenação: o que a pessoa leciona. Entra no prompt para
-- a IA saber com quem fala, e alimenta as sugestões da tela de chat.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disciplinas text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS segments_taught segment[] NOT NULL DEFAULT '{}'::segment[];

-- Observação livre mantida pela própria pessoa ("acompanho também o 9º ano do
-- meu filho mais velho"). Vai para o prompt, nunca para o filtro de acesso —
-- texto livre não pode ampliar permissão.
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_note text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_updated_at timestamptz;

/* --------------------------------------------------------- whitelabel ---- */

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

/* ---------------------------------------------- feedback nas respostas --- */

DO $$ BEGIN
  CREATE TYPE message_feedback AS ENUM ('util', 'nao_util');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback message_feedback;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_note text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- Relatório de lacunas: as perguntas marcadas como não úteis são exatamente o
-- que falta no acervo.
CREATE INDEX IF NOT EXISTS messages_feedback_idx
  ON messages (feedback) WHERE feedback IS NOT NULL;

/* ------------------------------------------- rastreio da consulta feita -- */

-- Guarda a consulta autônoma que a IA usou para buscar (depois de resolver
-- follow-ups) e se ela pediu esclarecimento em vez de responder. É o que
-- permite auditar por que uma resposta saiu ruim.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_query text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS was_clarification boolean NOT NULL DEFAULT false;

/* ----------------------------------------- limite de uso por usuário ----- */

-- Contagem de perguntas por janela de tempo, para o rate limiting.
CREATE INDEX IF NOT EXISTS messages_role_created_idx
  ON messages (role, created_at);

-- ==========================================================================
-- 0002_context_by_admin.sql
-- ==========================================================================

-- O contexto do usuário passa a ser responsabilidade exclusiva da secretaria.
--
-- Antes, cada pessoa editava o próprio contexto na tela de perfil. Isso caiu:
-- aluno tem apenas nome e série (cadastro da secretaria), e o contexto do
-- professor (séries e matérias) também é definido pela administração.
-- Idempotente.

/* --------------------------------------------- séries que o professor dá -- */

-- Coluna própria em vez de reaproveitar extra_series: para o aluno aquele
-- campo recorta ACESSO, e para o professor é só contexto. Misturar os dois
-- num campo só é como um bug de permissão nasce.
ALTER TABLE users ADD COLUMN IF NOT EXISTS series_taught text[] NOT NULL DEFAULT '{}'::text[];

-- Migra o que já existia: para professores, extra_series significava
-- "séries que acompanha".
UPDATE users
   SET series_taught = extra_series
 WHERE role IN ('professor', 'coordenacao')
   AND cardinality(extra_series) > 0
   AND cardinality(series_taught) = 0;

/* ------------------------------------------- ano letivo da série cadastrada */

-- Guarda em que ano letivo a série vale. A série vigente é calculada a partir
-- disto, então a virada de ano avança as turmas sem rotina agendada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS serie_ano_letivo integer;

UPDATE users
   SET serie_ano_letivo = EXTRACT(YEAR FROM CURRENT_DATE)::int
 WHERE serie IS NOT NULL AND serie_ano_letivo IS NULL;

/* ------------------------------------------------ fim da observação livre -- */

-- O campo de texto livre do perfil deixa de existir: o contexto não é mais
-- editável pela própria pessoa. Nenhum dado de produção depende dele.
ALTER TABLE users DROP COLUMN IF EXISTS context_note;
ALTER TABLE users DROP COLUMN IF EXISTS context_updated_at;

-- ==========================================================================
-- 0003_tenant_settings.sql
-- ==========================================================================

-- Configurações do colégio saem da variável de ambiente e passam para o banco,
-- editáveis pelo administrador.
--
-- Motivo: as datas das etapas e o contexto institucional são conhecimento da
-- escola, não do time de desenvolvimento. Deixá-los em .env obrigaria um deploy
-- a cada correção da secretaria. Idempotente.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

/* -------------------------------------------- continuidade da conversa ---- */

-- Última interação da conversa. Uma pergunta nova retoma a mesma thread se a
-- anterior for recente; depois da janela de inatividade, começa outra.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE conversations SET last_message_at = updated_at WHERE last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_user_recent_idx
  ON conversations (user_id, last_message_at DESC);

-- ==========================================================================
-- 0004_busca_sem_acento.sql
-- ==========================================================================

-- Busca lexical sem acento.
--
-- A metade lexical da busca híbrida usava a configuração `portuguese` crua, que
-- é sensível a acento: "matemática" indexa como 'matemat' e "matematica"
-- consulta 'matemat'... mas "recuperação" indexa 'recuperaça' e "recuperacao"
-- consulta 'recuperaca'. Na prática, quem digita sem acento — o normal num
-- celular — não achava nada pela metade lexical, e sobrava só o vetor.
--
-- A correção é uma configuração de busca própria que passa o `unaccent` antes
-- do radicalizador português, usada tanto na indexação quanto na consulta.

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config c
    JOIN pg_namespace n ON n.oid = c.cfgnamespace
    WHERE c.cfgname = 'portuguese_unaccent' AND n.nspname = 'public'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION public.portuguese_unaccent (COPY = pg_catalog.portuguese);

    -- `unaccent` antes de `portuguese_stem`: primeiro tira o acento, depois
    -- reduz ao radical. A ordem importa — invertida, o radical já viria acentuado.
    ALTER TEXT SEARCH CONFIGURATION public.portuguese_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;

-- A coluna é gerada, então não dá para trocar a expressão no lugar: derruba e
-- recria. O conteúdo não se perde — ele vem de `content`, que continua lá.
--
-- O IF interno faz a migração ser barata quando reexecutada: sem ele, cada
-- chamada de /api/setup recalcularia o tsvector do acervo inteiro à toa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attrdef ad
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE ad.adrelid = 'document_chunks'::regclass
      AND a.attname = 'content_tsv'
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%portuguese_unaccent%'
  ) THEN
    DROP INDEX IF EXISTS chunks_tsv_idx;
    ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_tsv;
    ALTER TABLE document_chunks
      ADD COLUMN content_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('public.portuguese_unaccent'::regconfig, coalesce(content, ''))
      ) STORED;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON document_chunks USING gin (content_tsv);

-- ==========================================================================
-- 0005_restricao_explicita.sql
-- ==========================================================================

-- Classificar não é restringir.
--
-- Até aqui, `series` e `segments` — preenchidos pela classificação automática —
-- valiam como controle de acesso: um documento que a IA leu como "7º ano"
-- sumia para todo o resto da escola. O efeito colateral é pior que o problema
-- que resolvia: um comunicado de interesse geral, classificado com uma série
-- por causa de uma menção de passagem, deixava de existir para quase todos.
--
-- A partir daqui esses campos são METADADO: entram no cabeçalho do trecho, na
-- exibição e na ordenação da busca, mas não escondem nada. Só restringe quem a
-- administração marcar explicitamente no upload, e é isso que esta coluna
-- registra.
--
-- O que NÃO muda: `audience` (aluno / professor / coordenação) continua
-- restringindo sempre. Ali a escolha é sempre humana e sempre deliberada — um
-- documento marcado como "só corpo docente" é exatamente isso.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restrict_to_scope boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN documents.restrict_to_scope IS
  'Quando verdadeiro, series/segments restringem quem enxerga o documento. '
  'Quando falso (padrão), são apenas classificação.';

-- O acervo já ingerido foi classificado pela IA, não escolhido pela
-- administração: fica com o padrão (false) e volta a ser visível. Quem quiser
-- restringir algum documento antigo faz isso pela tela de ingestão.

-- ==========================================================================
-- 0006_data_do_documento.sql
-- ==========================================================================

-- A data do documento, separada das datas que o documento anuncia.
--
-- São duas coisas diferentes e o sistema tratava as duas como uma só:
--
-- - A data do CABEÇALHO ("Belo Horizonte, 08 de outubro de 2026") diz quando o
--   comunicado foi escrito. Serve para datá-lo na tela, ordenar o acervo e
--   decidir qual é o mais recente quando dois se contradizem. Nunca é evento.
-- - As datas do CORPO ("prova em 09/12", "entrega até 30/10") são o que vai
--   para o calendário. Já eram tratadas assim, em `document_events`.
--
-- Faltava onde guardar a primeira. Sem ela, a listagem mostrava a data de
-- upload — que diz quando a secretaria subiu o arquivo, não de quando é o
-- comunicado — e a IA não tinha como comparar a idade de dois documentos.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_date date;

COMMENT ON COLUMN documents.document_date IS
  'Data impressa no cabeçalho/assinatura do documento. Nunca vira evento de calendário.';

CREATE INDEX IF NOT EXISTS documents_document_date_idx
  ON documents (tenant_id, document_date DESC NULLS LAST);

-- Início de vigência deixa de ser deduzido pela IA (ver 0005 e o histórico do
-- pipeline): agora só a administração define, no formulário de upload. O acervo
-- que já tem data futura gravada pela classificação automática volta a ficar
-- visível — é o mesmo efeito de docs/corrigir-vigencias.sql, aplicado aqui para
-- quem atualiza direto pelo SQL Editor.
UPDATE documents SET valid_from = NULL WHERE valid_from > CURRENT_DATE;

-- ==========================================================================
-- todas-as-migracoes.sql
-- ==========================================================================

-- GERADO POR scripts/bundle-migrations.ts — NÃO EDITE À MÃO.
-- A fonte da verdade são os arquivos em drizzle/*.sql.
--
-- Todas as migrações do projeto, na ordem, num arquivo só.
-- Para aplicar: Supabase -> SQL Editor -> New query -> colar tudo -> Run.
-- É idempotente: rodar de novo num banco já atualizado não faz nada.

-- ==========================================================================
-- 0000_init.sql
-- ==========================================================================

-- Esquema inicial do assistente institucional.
-- Idempotente: pode ser reaplicado sem quebrar um banco já migrado.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

/* ---------------------------------------------------------------- enums -- */

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('aluno', 'professor', 'coordenacao', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE segment AS ENUM ('educacao_infantil', 'fundamental_i', 'fundamental_ii', 'ensino_medio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'autorizacao', 'bilhete', 'circular', 'comunicado', 'conteudo_avaliacao',
    'convite', 'cronograma_provas', 'lista_material', 'prova', 'recuperacao',
    'calendario', 'regulamento', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ingestion_status AS ENUM (
    'pending', 'extracting', 'classifying', 'embedding', 'ready', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('prova', 'recuperacao', 'simulado', 'evento', 'entrega');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_review AS ENUM ('a_revisar', 'ativo', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* -------------------------------------------------------------- tenants -- */

CREATE TABLE IF NOT EXISTS tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  logo_url     text,
  favicon_url  text,
  branding     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

/* ---------------------------------------------------------------- users -- */

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matricula     text NOT NULL,
  email         text NOT NULL,
  name          text NOT NULL,
  role          user_role NOT NULL,
  password_hash text NOT NULL,
  segment       segment,
  serie         text,
  turma         text,
  extra_series  text[] NOT NULL DEFAULT '{}'::text[],
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_matricula_idx ON users (tenant_id, matricula);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx     ON users (tenant_id, email);

/* ------------------------------------------------------------ documents -- */

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  doc_number    integer,
  type          document_type NOT NULL DEFAULT 'outro',
  summary       text,
  segments      segment[] NOT NULL DEFAULT '{}'::segment[],
  series        text[] NOT NULL DEFAULT '{}'::text[],
  etapa         text,
  ano_letivo    integer,
  valid_from    date,
  valid_until   date,
  audience      user_role[] NOT NULL DEFAULT '{}'::user_role[],
  source_kind   text NOT NULL DEFAULT 'upload',
  source_ref    text,
  storage_path  text,
  mime_type     text,
  byte_size     integer,
  checksum      text,
  page_count    integer,
  used_ocr      boolean NOT NULL DEFAULT false,
  status        ingestion_status NOT NULL DEFAULT 'pending',
  status_detail text,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_status_idx ON documents (tenant_id, status);
CREATE INDEX IF NOT EXISTS documents_type_idx          ON documents (type);
CREATE INDEX IF NOT EXISTS documents_valid_until_idx   ON documents (valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS documents_tenant_checksum_idx ON documents (tenant_id, checksum);

/* ------------------------------------------------------ document_chunks -- */

CREATE TABLE IF NOT EXISTS document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ordinal        integer NOT NULL,
  page           integer,
  content        text NOT NULL,
  context_header text,
  token_count    integer,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Coluna gerada: mantém o índice lexical sempre em sincronia com o conteúdo,
-- sem trigger e sem risco de esquecer de atualizar na escrita.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS chunks_document_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx      ON document_chunks USING gin (content_tsv);

-- HNSW para similaridade de cosseno: recall melhor que IVFFlat e sem etapa de
-- treino, o que importa porque o acervo cresce de forma incremental.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

/* ------------------------------------------------------ document_events -- */

CREATE TABLE IF NOT EXISTS document_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title           text NOT NULL,
  type            event_type NOT NULL,
  starts_on       date NOT NULL,
  ends_on         date,
  starts_at_time  text,
  subject         text,
  chamada         integer,
  segments        segment[] NOT NULL DEFAULT '{}'::segment[],
  series          text[] NOT NULL DEFAULT '{}'::text[],
  review          event_review NOT NULL DEFAULT 'a_revisar',
  confidence      text,
  source_excerpt  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_tenant_date_idx ON document_events (tenant_id, starts_on);
CREATE INDEX IF NOT EXISTS events_document_idx    ON document_events (document_id);

/* -------------------------------------------------------- conversations -- */

CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              text NOT NULL,
  content           text NOT NULL,
  citations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer,
  model             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

/* ------------------------------------------------------- ingestion_jobs -- */

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  status      ingestion_status NOT NULL DEFAULT 'pending',
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  started_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ==========================================================================
-- 0001_context_branding_feedback.sql
-- ==========================================================================

-- Contexto acadêmico mais rico por usuário, identidade visual por tenant e
-- feedback por resposta. Idempotente.

/* ------------------------------------------------ contexto do usuário ---- */

-- Para professores e coordenação: o que a pessoa leciona. Entra no prompt para
-- a IA saber com quem fala, e alimenta as sugestões da tela de chat.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disciplinas text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS segments_taught segment[] NOT NULL DEFAULT '{}'::segment[];

-- Observação livre mantida pela própria pessoa ("acompanho também o 9º ano do
-- meu filho mais velho"). Vai para o prompt, nunca para o filtro de acesso —
-- texto livre não pode ampliar permissão.
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_note text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_updated_at timestamptz;

/* --------------------------------------------------------- whitelabel ---- */

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

/* ---------------------------------------------- feedback nas respostas --- */

DO $$ BEGIN
  CREATE TYPE message_feedback AS ENUM ('util', 'nao_util');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback message_feedback;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_note text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- Relatório de lacunas: as perguntas marcadas como não úteis são exatamente o
-- que falta no acervo.
CREATE INDEX IF NOT EXISTS messages_feedback_idx
  ON messages (feedback) WHERE feedback IS NOT NULL;

/* ------------------------------------------- rastreio da consulta feita -- */

-- Guarda a consulta autônoma que a IA usou para buscar (depois de resolver
-- follow-ups) e se ela pediu esclarecimento em vez de responder. É o que
-- permite auditar por que uma resposta saiu ruim.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_query text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS was_clarification boolean NOT NULL DEFAULT false;

/* ----------------------------------------- limite de uso por usuário ----- */

-- Contagem de perguntas por janela de tempo, para o rate limiting.
CREATE INDEX IF NOT EXISTS messages_role_created_idx
  ON messages (role, created_at);

-- ==========================================================================
-- 0002_context_by_admin.sql
-- ==========================================================================

-- O contexto do usuário passa a ser responsabilidade exclusiva da secretaria.
--
-- Antes, cada pessoa editava o próprio contexto na tela de perfil. Isso caiu:
-- aluno tem apenas nome e série (cadastro da secretaria), e o contexto do
-- professor (séries e matérias) também é definido pela administração.
-- Idempotente.

/* --------------------------------------------- séries que o professor dá -- */

-- Coluna própria em vez de reaproveitar extra_series: para o aluno aquele
-- campo recorta ACESSO, e para o professor é só contexto. Misturar os dois
-- num campo só é como um bug de permissão nasce.
ALTER TABLE users ADD COLUMN IF NOT EXISTS series_taught text[] NOT NULL DEFAULT '{}'::text[];

-- Migra o que já existia: para professores, extra_series significava
-- "séries que acompanha".
UPDATE users
   SET series_taught = extra_series
 WHERE role IN ('professor', 'coordenacao')
   AND cardinality(extra_series) > 0
   AND cardinality(series_taught) = 0;

/* ------------------------------------------- ano letivo da série cadastrada */

-- Guarda em que ano letivo a série vale. A série vigente é calculada a partir
-- disto, então a virada de ano avança as turmas sem rotina agendada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS serie_ano_letivo integer;

UPDATE users
   SET serie_ano_letivo = EXTRACT(YEAR FROM CURRENT_DATE)::int
 WHERE serie IS NOT NULL AND serie_ano_letivo IS NULL;

/* ------------------------------------------------ fim da observação livre -- */

-- O campo de texto livre do perfil deixa de existir: o contexto não é mais
-- editável pela própria pessoa. Nenhum dado de produção depende dele.
ALTER TABLE users DROP COLUMN IF EXISTS context_note;
ALTER TABLE users DROP COLUMN IF EXISTS context_updated_at;

-- ==========================================================================
-- 0003_tenant_settings.sql
-- ==========================================================================

-- Configurações do colégio saem da variável de ambiente e passam para o banco,
-- editáveis pelo administrador.
--
-- Motivo: as datas das etapas e o contexto institucional são conhecimento da
-- escola, não do time de desenvolvimento. Deixá-los em .env obrigaria um deploy
-- a cada correção da secretaria. Idempotente.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

/* -------------------------------------------- continuidade da conversa ---- */

-- Última interação da conversa. Uma pergunta nova retoma a mesma thread se a
-- anterior for recente; depois da janela de inatividade, começa outra.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE conversations SET last_message_at = updated_at WHERE last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_user_recent_idx
  ON conversations (user_id, last_message_at DESC);

-- ==========================================================================
-- 0004_busca_sem_acento.sql
-- ==========================================================================

-- Busca lexical sem acento.
--
-- A metade lexical da busca híbrida usava a configuração `portuguese` crua, que
-- é sensível a acento: "matemática" indexa como 'matemat' e "matematica"
-- consulta 'matemat'... mas "recuperação" indexa 'recuperaça' e "recuperacao"
-- consulta 'recuperaca'. Na prática, quem digita sem acento — o normal num
-- celular — não achava nada pela metade lexical, e sobrava só o vetor.
--
-- A correção é uma configuração de busca própria que passa o `unaccent` antes
-- do radicalizador português, usada tanto na indexação quanto na consulta.

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config c
    JOIN pg_namespace n ON n.oid = c.cfgnamespace
    WHERE c.cfgname = 'portuguese_unaccent' AND n.nspname = 'public'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION public.portuguese_unaccent (COPY = pg_catalog.portuguese);

    -- `unaccent` antes de `portuguese_stem`: primeiro tira o acento, depois
    -- reduz ao radical. A ordem importa — invertida, o radical já viria acentuado.
    ALTER TEXT SEARCH CONFIGURATION public.portuguese_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;

-- A coluna é gerada, então não dá para trocar a expressão no lugar: derruba e
-- recria. O conteúdo não se perde — ele vem de `content`, que continua lá.
--
-- O IF interno faz a migração ser barata quando reexecutada: sem ele, cada
-- chamada de /api/setup recalcularia o tsvector do acervo inteiro à toa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attrdef ad
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE ad.adrelid = 'document_chunks'::regclass
      AND a.attname = 'content_tsv'
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%portuguese_unaccent%'
  ) THEN
    DROP INDEX IF EXISTS chunks_tsv_idx;
    ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_tsv;
    ALTER TABLE document_chunks
      ADD COLUMN content_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('public.portuguese_unaccent'::regconfig, coalesce(content, ''))
      ) STORED;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON document_chunks USING gin (content_tsv);

-- ==========================================================================
-- 0005_restricao_explicita.sql
-- ==========================================================================

-- Classificar não é restringir.
--
-- Até aqui, `series` e `segments` — preenchidos pela classificação automática —
-- valiam como controle de acesso: um documento que a IA leu como "7º ano"
-- sumia para todo o resto da escola. O efeito colateral é pior que o problema
-- que resolvia: um comunicado de interesse geral, classificado com uma série
-- por causa de uma menção de passagem, deixava de existir para quase todos.
--
-- A partir daqui esses campos são METADADO: entram no cabeçalho do trecho, na
-- exibição e na ordenação da busca, mas não escondem nada. Só restringe quem a
-- administração marcar explicitamente no upload, e é isso que esta coluna
-- registra.
--
-- O que NÃO muda: `audience` (aluno / professor / coordenação) continua
-- restringindo sempre. Ali a escolha é sempre humana e sempre deliberada — um
-- documento marcado como "só corpo docente" é exatamente isso.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restrict_to_scope boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN documents.restrict_to_scope IS
  'Quando verdadeiro, series/segments restringem quem enxerga o documento. '
  'Quando falso (padrão), são apenas classificação.';

-- O acervo já ingerido foi classificado pela IA, não escolhido pela
-- administração: fica com o padrão (false) e volta a ser visível. Quem quiser
-- restringir algum documento antigo faz isso pela tela de ingestão.

-- ==========================================================================
-- 0006_data_do_documento.sql
-- ==========================================================================

-- A data do documento, separada das datas que o documento anuncia.
--
-- São duas coisas diferentes e o sistema tratava as duas como uma só:
--
-- - A data do CABEÇALHO ("Belo Horizonte, 08 de outubro de 2026") diz quando o
--   comunicado foi escrito. Serve para datá-lo na tela, ordenar o acervo e
--   decidir qual é o mais recente quando dois se contradizem. Nunca é evento.
-- - As datas do CORPO ("prova em 09/12", "entrega até 30/10") são o que vai
--   para o calendário. Já eram tratadas assim, em `document_events`.
--
-- Faltava onde guardar a primeira. Sem ela, a listagem mostrava a data de
-- upload — que diz quando a secretaria subiu o arquivo, não de quando é o
-- comunicado — e a IA não tinha como comparar a idade de dois documentos.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_date date;

COMMENT ON COLUMN documents.document_date IS
  'Data impressa no cabeçalho/assinatura do documento. Nunca vira evento de calendário.';

CREATE INDEX IF NOT EXISTS documents_document_date_idx
  ON documents (tenant_id, document_date DESC NULLS LAST);

-- Início de vigência deixa de ser deduzido pela IA (ver 0005 e o histórico do
-- pipeline): agora só a administração define, no formulário de upload. O acervo
-- que já tem data futura gravada pela classificação automática volta a ficar
-- visível — é o mesmo efeito de docs/corrigir-vigencias.sql, aplicado aqui para
-- quem atualiza direto pelo SQL Editor.
UPDATE documents SET valid_from = NULL WHERE valid_from > CURRENT_DATE;

-- ==========================================================================
-- todas-as-migracoes.sql
-- ==========================================================================

-- GERADO POR scripts/bundle-migrations.ts — NÃO EDITE À MÃO.
-- A fonte da verdade são os arquivos em drizzle/*.sql.
--
-- Todas as migrações do projeto, na ordem, num arquivo só.
-- Para aplicar: Supabase -> SQL Editor -> New query -> colar tudo -> Run.
-- É idempotente: rodar de novo num banco já atualizado não faz nada.

-- ==========================================================================
-- 0000_init.sql
-- ==========================================================================

-- Esquema inicial do assistente institucional.
-- Idempotente: pode ser reaplicado sem quebrar um banco já migrado.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

/* ---------------------------------------------------------------- enums -- */

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('aluno', 'professor', 'coordenacao', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE segment AS ENUM ('educacao_infantil', 'fundamental_i', 'fundamental_ii', 'ensino_medio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'autorizacao', 'bilhete', 'circular', 'comunicado', 'conteudo_avaliacao',
    'convite', 'cronograma_provas', 'lista_material', 'prova', 'recuperacao',
    'calendario', 'regulamento', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ingestion_status AS ENUM (
    'pending', 'extracting', 'classifying', 'embedding', 'ready', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('prova', 'recuperacao', 'simulado', 'evento', 'entrega');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_review AS ENUM ('a_revisar', 'ativo', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* -------------------------------------------------------------- tenants -- */

CREATE TABLE IF NOT EXISTS tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  logo_url     text,
  favicon_url  text,
  branding     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

/* ---------------------------------------------------------------- users -- */

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matricula     text NOT NULL,
  email         text NOT NULL,
  name          text NOT NULL,
  role          user_role NOT NULL,
  password_hash text NOT NULL,
  segment       segment,
  serie         text,
  turma         text,
  extra_series  text[] NOT NULL DEFAULT '{}'::text[],
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_matricula_idx ON users (tenant_id, matricula);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx     ON users (tenant_id, email);

/* ------------------------------------------------------------ documents -- */

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  doc_number    integer,
  type          document_type NOT NULL DEFAULT 'outro',
  summary       text,
  segments      segment[] NOT NULL DEFAULT '{}'::segment[],
  series        text[] NOT NULL DEFAULT '{}'::text[],
  etapa         text,
  ano_letivo    integer,
  valid_from    date,
  valid_until   date,
  audience      user_role[] NOT NULL DEFAULT '{}'::user_role[],
  source_kind   text NOT NULL DEFAULT 'upload',
  source_ref    text,
  storage_path  text,
  mime_type     text,
  byte_size     integer,
  checksum      text,
  page_count    integer,
  used_ocr      boolean NOT NULL DEFAULT false,
  status        ingestion_status NOT NULL DEFAULT 'pending',
  status_detail text,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_status_idx ON documents (tenant_id, status);
CREATE INDEX IF NOT EXISTS documents_type_idx          ON documents (type);
CREATE INDEX IF NOT EXISTS documents_valid_until_idx   ON documents (valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS documents_tenant_checksum_idx ON documents (tenant_id, checksum);

/* ------------------------------------------------------ document_chunks -- */

CREATE TABLE IF NOT EXISTS document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ordinal        integer NOT NULL,
  page           integer,
  content        text NOT NULL,
  context_header text,
  token_count    integer,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Coluna gerada: mantém o índice lexical sempre em sincronia com o conteúdo,
-- sem trigger e sem risco de esquecer de atualizar na escrita.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS chunks_document_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx      ON document_chunks USING gin (content_tsv);

-- HNSW para similaridade de cosseno: recall melhor que IVFFlat e sem etapa de
-- treino, o que importa porque o acervo cresce de forma incremental.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

/* ------------------------------------------------------ document_events -- */

CREATE TABLE IF NOT EXISTS document_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title           text NOT NULL,
  type            event_type NOT NULL,
  starts_on       date NOT NULL,
  ends_on         date,
  starts_at_time  text,
  subject         text,
  chamada         integer,
  segments        segment[] NOT NULL DEFAULT '{}'::segment[],
  series          text[] NOT NULL DEFAULT '{}'::text[],
  review          event_review NOT NULL DEFAULT 'a_revisar',
  confidence      text,
  source_excerpt  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_tenant_date_idx ON document_events (tenant_id, starts_on);
CREATE INDEX IF NOT EXISTS events_document_idx    ON document_events (document_id);

/* -------------------------------------------------------- conversations -- */

CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              text NOT NULL,
  content           text NOT NULL,
  citations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer,
  model             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

/* ------------------------------------------------------- ingestion_jobs -- */

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  status      ingestion_status NOT NULL DEFAULT 'pending',
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  started_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ==========================================================================
-- 0001_context_branding_feedback.sql
-- ==========================================================================

-- Contexto acadêmico mais rico por usuário, identidade visual por tenant e
-- feedback por resposta. Idempotente.

/* ------------------------------------------------ contexto do usuário ---- */

-- Para professores e coordenação: o que a pessoa leciona. Entra no prompt para
-- a IA saber com quem fala, e alimenta as sugestões da tela de chat.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disciplinas text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS segments_taught segment[] NOT NULL DEFAULT '{}'::segment[];

-- Observação livre mantida pela própria pessoa ("acompanho também o 9º ano do
-- meu filho mais velho"). Vai para o prompt, nunca para o filtro de acesso —
-- texto livre não pode ampliar permissão.
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_note text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS context_updated_at timestamptz;

/* --------------------------------------------------------- whitelabel ---- */

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

/* ---------------------------------------------- feedback nas respostas --- */

DO $$ BEGIN
  CREATE TYPE message_feedback AS ENUM ('util', 'nao_util');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback message_feedback;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_note text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

-- Relatório de lacunas: as perguntas marcadas como não úteis são exatamente o
-- que falta no acervo.
CREATE INDEX IF NOT EXISTS messages_feedback_idx
  ON messages (feedback) WHERE feedback IS NOT NULL;

/* ------------------------------------------- rastreio da consulta feita -- */

-- Guarda a consulta autônoma que a IA usou para buscar (depois de resolver
-- follow-ups) e se ela pediu esclarecimento em vez de responder. É o que
-- permite auditar por que uma resposta saiu ruim.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_query text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS was_clarification boolean NOT NULL DEFAULT false;

/* ----------------------------------------- limite de uso por usuário ----- */

-- Contagem de perguntas por janela de tempo, para o rate limiting.
CREATE INDEX IF NOT EXISTS messages_role_created_idx
  ON messages (role, created_at);

-- ==========================================================================
-- 0002_context_by_admin.sql
-- ==========================================================================

-- O contexto do usuário passa a ser responsabilidade exclusiva da secretaria.
--
-- Antes, cada pessoa editava o próprio contexto na tela de perfil. Isso caiu:
-- aluno tem apenas nome e série (cadastro da secretaria), e o contexto do
-- professor (séries e matérias) também é definido pela administração.
-- Idempotente.

/* --------------------------------------------- séries que o professor dá -- */

-- Coluna própria em vez de reaproveitar extra_series: para o aluno aquele
-- campo recorta ACESSO, e para o professor é só contexto. Misturar os dois
-- num campo só é como um bug de permissão nasce.
ALTER TABLE users ADD COLUMN IF NOT EXISTS series_taught text[] NOT NULL DEFAULT '{}'::text[];

-- Migra o que já existia: para professores, extra_series significava
-- "séries que acompanha".
UPDATE users
   SET series_taught = extra_series
 WHERE role IN ('professor', 'coordenacao')
   AND cardinality(extra_series) > 0
   AND cardinality(series_taught) = 0;

/* ------------------------------------------- ano letivo da série cadastrada */

-- Guarda em que ano letivo a série vale. A série vigente é calculada a partir
-- disto, então a virada de ano avança as turmas sem rotina agendada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS serie_ano_letivo integer;

UPDATE users
   SET serie_ano_letivo = EXTRACT(YEAR FROM CURRENT_DATE)::int
 WHERE serie IS NOT NULL AND serie_ano_letivo IS NULL;

/* ------------------------------------------------ fim da observação livre -- */

-- O campo de texto livre do perfil deixa de existir: o contexto não é mais
-- editável pela própria pessoa. Nenhum dado de produção depende dele.
ALTER TABLE users DROP COLUMN IF EXISTS context_note;
ALTER TABLE users DROP COLUMN IF EXISTS context_updated_at;

-- ==========================================================================
-- 0003_tenant_settings.sql
-- ==========================================================================

-- Configurações do colégio saem da variável de ambiente e passam para o banco,
-- editáveis pelo administrador.
--
-- Motivo: as datas das etapas e o contexto institucional são conhecimento da
-- escola, não do time de desenvolvimento. Deixá-los em .env obrigaria um deploy
-- a cada correção da secretaria. Idempotente.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

/* -------------------------------------------- continuidade da conversa ---- */

-- Última interação da conversa. Uma pergunta nova retoma a mesma thread se a
-- anterior for recente; depois da janela de inatividade, começa outra.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE conversations SET last_message_at = updated_at WHERE last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_user_recent_idx
  ON conversations (user_id, last_message_at DESC);

-- ==========================================================================
-- 0004_busca_sem_acento.sql
-- ==========================================================================

-- Busca lexical sem acento.
--
-- A metade lexical da busca híbrida usava a configuração `portuguese` crua, que
-- é sensível a acento: "matemática" indexa como 'matemat' e "matematica"
-- consulta 'matemat'... mas "recuperação" indexa 'recuperaça' e "recuperacao"
-- consulta 'recuperaca'. Na prática, quem digita sem acento — o normal num
-- celular — não achava nada pela metade lexical, e sobrava só o vetor.
--
-- A correção é uma configuração de busca própria que passa o `unaccent` antes
-- do radicalizador português, usada tanto na indexação quanto na consulta.

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config c
    JOIN pg_namespace n ON n.oid = c.cfgnamespace
    WHERE c.cfgname = 'portuguese_unaccent' AND n.nspname = 'public'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION public.portuguese_unaccent (COPY = pg_catalog.portuguese);

    -- `unaccent` antes de `portuguese_stem`: primeiro tira o acento, depois
    -- reduz ao radical. A ordem importa — invertida, o radical já viria acentuado.
    ALTER TEXT SEARCH CONFIGURATION public.portuguese_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;

-- A coluna é gerada, então não dá para trocar a expressão no lugar: derruba e
-- recria. O conteúdo não se perde — ele vem de `content`, que continua lá.
--
-- O IF interno faz a migração ser barata quando reexecutada: sem ele, cada
-- chamada de /api/setup recalcularia o tsvector do acervo inteiro à toa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attrdef ad
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE ad.adrelid = 'document_chunks'::regclass
      AND a.attname = 'content_tsv'
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%portuguese_unaccent%'
  ) THEN
    DROP INDEX IF EXISTS chunks_tsv_idx;
    ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_tsv;
    ALTER TABLE document_chunks
      ADD COLUMN content_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('public.portuguese_unaccent'::regconfig, coalesce(content, ''))
      ) STORED;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON document_chunks USING gin (content_tsv);

-- ==========================================================================
-- 0005_restricao_explicita.sql
-- ==========================================================================

-- Classificar não é restringir.
--
-- Até aqui, `series` e `segments` — preenchidos pela classificação automática —
-- valiam como controle de acesso: um documento que a IA leu como "7º ano"
-- sumia para todo o resto da escola. O efeito colateral é pior que o problema
-- que resolvia: um comunicado de interesse geral, classificado com uma série
-- por causa de uma menção de passagem, deixava de existir para quase todos.
--
-- A partir daqui esses campos são METADADO: entram no cabeçalho do trecho, na
-- exibição e na ordenação da busca, mas não escondem nada. Só restringe quem a
-- administração marcar explicitamente no upload, e é isso que esta coluna
-- registra.
--
-- O que NÃO muda: `audience` (aluno / professor / coordenação) continua
-- restringindo sempre. Ali a escolha é sempre humana e sempre deliberada — um
-- documento marcado como "só corpo docente" é exatamente isso.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restrict_to_scope boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN documents.restrict_to_scope IS
  'Quando verdadeiro, series/segments restringem quem enxerga o documento. '
  'Quando falso (padrão), são apenas classificação.';

-- O acervo já ingerido foi classificado pela IA, não escolhido pela
-- administração: fica com o padrão (false) e volta a ser visível. Quem quiser
-- restringir algum documento antigo faz isso pela tela de ingestão.

