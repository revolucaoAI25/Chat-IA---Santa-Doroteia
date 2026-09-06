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
