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
