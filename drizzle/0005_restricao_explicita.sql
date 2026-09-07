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
