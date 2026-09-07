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
