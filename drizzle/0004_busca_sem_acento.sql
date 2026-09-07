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
