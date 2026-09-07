-- Conserta a vigência dos documentos ingeridos ANTES da correção do validFrom.
--
-- Contexto: até a versão que introduziu `safeValidFrom`, o classificador podia
-- gravar como "início de vigência" a data do evento que o documento anuncia.
-- Um comunicado de outubro sobre a formatura de dezembro ficava com
-- `valid_from = 2026-12-11` e sumia para todo mundo até lá — sem erro e sem
-- aviso. A correção no código impede que isso volte a acontecer, mas não
-- reescreve as linhas que já estão no banco. É o que este arquivo faz.
--
-- Como usar: Supabase -> SQL Editor -> New query -> colar -> Run.
-- Pode rodar mais de uma vez; não faz nada quando não há o que corrigir.

-- ---------------------------------------------------------------------------
-- 1. Antes: veja o que será alterado.
-- ---------------------------------------------------------------------------

SELECT
  doc_number                                  AS numero,
  title                                       AS titulo,
  valid_from                                  AS comeca_em,
  valid_until                                 AS vence_em,
  CASE
    WHEN valid_from > CURRENT_DATE THEN 'invisível até ' || valid_from
    WHEN valid_until < CURRENT_DATE THEN 'já vencido'
    WHEN valid_until < CURRENT_DATE + 90 THEN 'vence cedo demais'
  END                                         AS problema
FROM documents
WHERE valid_from > CURRENT_DATE
   OR valid_until < CURRENT_DATE + 90
ORDER BY valid_from DESC NULLS LAST, valid_until;

-- ---------------------------------------------------------------------------
-- 2. Correção obrigatória: documento publicado vale a partir de agora.
--
-- Esvazia o início de vigência que está no futuro. É o que traz de volta os
-- documentos que sumiram.
-- ---------------------------------------------------------------------------

UPDATE documents
SET valid_from = NULL, updated_at = now()
WHERE valid_from > CURRENT_DATE;

-- ---------------------------------------------------------------------------
-- 3. Correção opcional: estender a vigência curta demais.
--
-- O código novo já recusa uma vigência deduzida pela IA com menos de 90 dias —
-- proposta assim quase sempre é a data do último evento do texto, e não uma
-- estimativa de validade. Para os documentos já ingeridos, este UPDATE aplica a
-- mesma regra: doze meses a partir de hoje.
--
-- Rode SÓ se você não tiver definido nenhuma vigência à mão; se definiu, este
-- comando sobrescreveria a sua escolha. Nesse caso, acrescente uma condição
-- para poupar os documentos que você configurou.
-- ---------------------------------------------------------------------------

UPDATE documents
SET valid_until = CURRENT_DATE + INTERVAL '12 months', updated_at = now()
WHERE valid_until IS NOT NULL
  AND valid_until < CURRENT_DATE + 90;

-- ---------------------------------------------------------------------------
-- 4. Depois: confirme que não sobrou nenhum documento invisível.
--    O resultado esperado é zero em todas as colunas.
-- ---------------------------------------------------------------------------

SELECT
  count(*) FILTER (WHERE valid_from > CURRENT_DATE)  AS invisiveis_ate_uma_data,
  count(*) FILTER (WHERE valid_until < CURRENT_DATE) AS vencidos,
  count(*)                                           AS total_no_acervo
FROM documents;
