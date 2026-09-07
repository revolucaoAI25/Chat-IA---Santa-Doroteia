import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embedQuery } from '@/lib/ai/embeddings';
import type { SessionUser } from '@/lib/auth/session';
import { documentVisibilityFilter } from './access';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  anoLetivo: number | null;
  validUntil: string | null;
  series: string[];
  content: string;
  score: number;
}

/** Quantos trechos entram no prompt final. */
const FINAL_K = 8;
/** Candidatos por estratégia antes da fusão. */
const CANDIDATES = 30;
/** Constante do Reciprocal Rank Fusion; 60 é o valor consagrado na literatura. */
const RRF_K = 60;

interface Candidate {
  rank: number;
  row: RawRow;
}

/** `db.execute` exige um tipo indexável; as colunas vêm em snake_case do SQL. */
interface RawRow extends Record<string, unknown> {
  chunk_id: string;
  document_id: string;
  title: string;
  type: string;
  doc_number: number | null;
  page: number | null;
  ano_letivo: number | null;
  valid_until: string | null;
  series: string[];
  content: string;
}

/**
 * Configuração de busca própria: `unaccent` antes do radicalizador português.
 *
 * Precisa ser a MESMA usada na coluna gerada `content_tsv` (ver
 * drizzle/0004). Com a `portuguese` crua, "matematica" digitado sem acento no
 * celular não casava com "matemática" no documento.
 */
const TS_CONFIG = 'public.portuguese_unaccent';

/**
 * Busca híbrida com controle de acesso.
 *
 * Três listas, porque cada uma falha onde as outras acertam:
 *
 * - **vetor** entende "quando é a prova de matemática?" e sinônimos, mas erra
 *   códigos exatos como "Comunicado 112";
 * - **lexical estrita** (`websearch_to_tsquery`, que junta os termos com AND)
 *   acerta o código exato — mas devolve zero assim que a consulta cresce, e o
 *   planejador justamente alonga a pergunta ("data da prova de história do 7º
 *   ano na etapa atual" exige os sete radicais no mesmo trecho);
 * - **lexical ampla** (os mesmos termos com OR, ordenados por `ts_rank`)
 *   sobrevive à consulta longa: quem casa mais termos sobe.
 *
 * O RRF combina as três por posição, sem precisar calibrar pesos entre escalas
 * de score incompatíveis. Um trecho bem colocado em duas listas ganha de um
 * primeiro colocado numa só — que é exatamente o comportamento desejado.
 */
export async function retrieve(
  user: SessionUser,
  query: string,
  limit = FINAL_K,
): Promise<RetrievedChunk[]> {
  const visibility = documentVisibilityFilter(user, 'd');

  const embedding = await embedQuery(query);
  const vectorLiteral = `[${embedding.join(',')}]`;

  const selection = sql`
    c.id            AS chunk_id,
    c.document_id   AS document_id,
    c.page          AS page,
    c.content       AS content,
    d.title         AS title,
    d.type::text    AS type,
    d.doc_number    AS doc_number,
    d.ano_letivo    AS ano_letivo,
    d.valid_until   AS valid_until,
    d.series        AS series
  `;

  const strict = sql`websearch_to_tsquery(${TS_CONFIG}::regconfig, ${query})`;

  /*
   * Os termos da consulta unidos por OR.
   *
   * Sai do próprio `to_tsvector`, e não de um split por espaço: assim os
   * radicais são exatamente os mesmos que foram indexados, as palavras vazias
   * ("de", "do", "na") já vêm descartadas, e `quote_literal` protege o
   * `to_tsquery` de qualquer caractere estranho. Consulta só de palavras vazias
   * devolve NULL, e `@@ NULL` simplesmente não casa com nada — sem erro.
   */
  const broad = sql`
    to_tsquery(
      ${TS_CONFIG}::regconfig,
      (SELECT string_agg(quote_literal(lexeme), ' | ')
         FROM unnest(tsvector_to_array(to_tsvector(${TS_CONFIG}::regconfig, ${query}))) AS lexeme)
    )
  `;

  const lexical = (tsquery: SQL) => db.execute<RawRow>(sql`
    SELECT ${selection}
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE ${visibility} AND c.content_tsv @@ ${tsquery}
    ORDER BY ts_rank(c.content_tsv, ${tsquery}) DESC
    LIMIT ${CANDIDATES}
  `);

  const [vectorHits, strictHits, broadHits] = await Promise.all([
    db.execute<RawRow>(sql`
      SELECT ${selection}
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ${visibility} AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${CANDIDATES}
    `),
    lexical(strict),
    lexical(broad),
  ]);

  return fuse(
    [toCandidates(vectorHits), toCandidates(strictHits), toCandidates(broadHits)],
    limit,
  );
}

function toCandidates(rows: Iterable<RawRow>): Candidate[] {
  return [...rows].map((row, index) => ({ rank: index + 1, row }));
}

function fuse(lists: Candidate[][], limit: number): RetrievedChunk[] {
  const scores = new Map<string, { score: number; row: RawRow }>();

  for (const list of lists) {
    for (const { rank, row } of list) {
      const existing = scores.get(row.chunk_id);
      const increment = 1 / (RRF_K + rank);
      if (existing) {
        existing.score += increment;
      } else {
        scores.set(row.chunk_id, { score: increment, row });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, row }) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      title: row.title,
      type: row.type,
      docNumber: row.doc_number,
      page: row.page,
      anoLetivo: row.ano_letivo,
      validUntil: row.valid_until,
      series: row.series ?? [],
      content: row.content,
      score,
    }));
}
