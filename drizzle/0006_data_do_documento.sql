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
