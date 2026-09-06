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
