import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embedTexts } from '@/lib/ai/embeddings';
import type { SessionUser } from '@/lib/auth/session';
import { documentVisibilityFilter } from './access';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  ordinal: number;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  anoLetivo: number | null;
  validUntil: string | null;
  series: string[];
  segments: string[];
  content: string;
  score: number;
}

/**
 * Amplitude da busca.
 *
 * "Quando é a prova de matemática?" precisa de poucos trechos muito certos.
 * "Quais são todos os prazos deste semestre?" precisa varrer. Um número fixo
 * atende mal aos dois — o planejador escolhe qual é o caso, e o orçamento muda
 * junto.
 */
export type Breadth = 'foco' | 'amplo';

interface Budget {
  /** Candidatos por estratégia, antes da fusão. */
  candidates: number;
  /** Teto de trechos no prompt. */
  maxChunks: number;
  /** Teto de caracteres — é o que de fato controla custo e diluição. */
  chars: number;
  /** Trechos por documento na primeira passada, para não monopolizar. */
  perDocument: number;
}

const BUDGETS: Record<Breadth, Budget> = {
  // ~14 mil caracteres ≈ 3,5 mil tokens de entrada. No gpt-4.1-mini isso é da
  // ordem de US$ 0,0014 por pergunta — o teto antigo de 8 trechos economizava
  // centavos e custava respostas incompletas.
  foco: { candidates: 30, maxChunks: 12, chars: 14_000, perDocument: 3 },
  amplo: { candidates: 60, maxChunks: 30, chars: 26_000, perDocument: 4 },
};

/** Fração do orçamento reservada para completar o contexto dos trechos escolhidos. */
const EXPANSION_SHARE = 0.3;

/** Constante do Reciprocal Rank Fusion; 60 é o valor consagrado na literatura. */
const RRF_K = 60;

/**
 * Preferência (não filtro) pela série de quem pergunta.
 *
 * Desde que a classificação deixou de restringir acesso, o aluno do 7º ano
 * também alcança o documento do 9º. Isso é proposital — mas o dele tem de vir
 * primeiro. Estes pesos reordenam sem nunca remover: um documento de outra
 * série continua disponível, só desce na lista.
 */
const SERIE_MATCH_BOOST = 1.25;
const OTHER_SERIE_PENALTY = 0.8;

/**
 * Configuração de busca própria: `unaccent` antes do radicalizador português.
 *
 * Precisa ser a MESMA usada na coluna gerada `content_tsv` (ver
 * drizzle/0004). Com a `portuguese` crua, "matematica" digitado sem acento no
 * celular não casava com "matemática" no documento.
 */
const TS_CONFIG = 'public.portuguese_unaccent';

interface Candidate {
  rank: number;
  row: RawRow;
}

/** `db.execute` exige um tipo indexável; as colunas vêm em snake_case do SQL. */
interface RawRow extends Record<string, unknown> {
  chunk_id: string;
  document_id: string;
  ordinal: number;
  title: string;
  type: string;
  doc_number: number | null;
  page: number | null;
  ano_letivo: number | null;
  valid_until: string | null;
  series: string[];
  segments: string[];
  content: string;
}

export interface RetrieveOptions {
  /**
   * Variações da mesma pergunta, produzidas pelo planejador na mesma chamada
   * em que ele reescreve a consulta — então não custam nenhuma ida a mais ao
   * modelo, só um lote de embeddings.
   */
  variants?: string[];
  breadth?: Breadth;
}

const SELECTION = sql`
  c.id            AS chunk_id,
  c.document_id   AS document_id,
  c.ordinal       AS ordinal,
  c.page          AS page,
  c.content       AS content,
  d.title         AS title,
  d.type::text    AS type,
  d.doc_number    AS doc_number,
  d.ano_letivo    AS ano_letivo,
  d.valid_until   AS valid_until,
  d.series        AS series,
  d.segments      AS segments
`;

/**
 * Busca híbrida com controle de acesso.
 *
 * Três estratégias, porque cada uma falha onde as outras acertam:
 *
 * - **vetorial** (uma lista por variação da pergunta) entende sinônimos e
 *   paráfrase, mas erra códigos exatos como "Comunicado 112";
 * - **lexical estrita** (`websearch_to_tsquery`, que junta os termos com AND)
 *   acerta o código exato — mas devolve zero assim que a consulta cresce, e o
 *   planejador justamente alonga a pergunta;
 * - **lexical ampla** (os mesmos termos com OR, ordenados por `ts_rank`)
 *   sobrevive à consulta longa: quem casa mais termos sobe.
 *
 * O RRF combina todas por posição, sem precisar calibrar pesos entre escalas de
 * score incompatíveis. Um trecho bem colocado em duas listas ganha de um
 * primeiro colocado numa só — que é exatamente o comportamento desejado.
 */
export async function retrieve(
  user: SessionUser,
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const budget = BUDGETS[options.breadth ?? 'foco'];
  const visibility = documentVisibilityFilter(user, 'd');

  // Variações duplicadas custariam uma busca por nada.
  const queries = [...new Set([query, ...(options.variants ?? [])].map((q) => q.trim()))]
    .filter(Boolean)
    .slice(0, 3);

  // Um único lote para todas as variações: uma chamada de rede, não três.
  const embeddings = await embedTexts(queries);

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

  const lexical = (tsquery: SQL) =>
    db.execute<RawRow>(sql`
      SELECT ${SELECTION}
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ${visibility} AND c.content_tsv @@ ${tsquery}
      ORDER BY ts_rank(c.content_tsv, ${tsquery}) DESC
      LIMIT ${budget.candidates}
    `);

  const vector = (embedding: number[]) =>
    db.execute<RawRow>(sql`
      SELECT ${SELECTION}
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ${visibility} AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${`[${embedding.join(',')}]`}::vector
      LIMIT ${budget.candidates}
    `);

  const lists = await Promise.all([
    ...embeddings.map(vector),
    lexical(strict),
    lexical(broad),
  ]);

  const ranked = fuse(lists.map(toCandidates), user);
  const chosen = select(ranked, budget);

  return expand(chosen, ranked, budget, visibility);
}

function toCandidates(rows: Iterable<RawRow>): Candidate[] {
  return [...rows].map((row, index) => ({ rank: index + 1, row }));
}

/** Séries que contam como "a minha" para efeito de ordenação. */
function ownSeries(user: SessionUser): Set<string> {
  if (user.role === 'aluno') {
    return new Set([user.serie, ...user.extraSeries].filter(Boolean) as string[]);
  }
  // Para o professor vale o que ele leciona; para admin/coordenação, nada —
  // eles perguntam sobre a escola inteira.
  return new Set(user.seriesTaught);
}

function fuse(lists: Candidate[][], user: SessionUser): RetrievedChunk[] {
  const scores = new Map<string, { score: number; row: RawRow }>();

  for (const list of lists) {
    for (const { rank, row } of list) {
      const entry = scores.get(row.chunk_id);
      const increment = 1 / (RRF_K + rank);
      if (entry) entry.score += increment;
      else scores.set(row.chunk_id, { score: increment, row });
    }
  }

  const mine = ownSeries(user);

  return [...scores.values()]
    .map(({ score, row }) => {
      const series = row.series ?? [];
      let weight = 1;
      if (mine.size > 0 && series.length > 0) {
        weight = series.some((s) => mine.has(s)) ? SERIE_MATCH_BOOST : OTHER_SERIE_PENALTY;
      }
      return toChunk(row, score * weight);
    })
    .sort((a, b) => b.score - a.score);
}

function toChunk(row: RawRow, score: number): RetrievedChunk {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    ordinal: row.ordinal,
    title: row.title,
    type: row.type,
    docNumber: row.doc_number,
    page: row.page,
    anoLetivo: row.ano_letivo,
    validUntil: row.valid_until,
    series: row.series ?? [],
    segments: row.segments ?? [],
    content: row.content,
    score,
  };
}

/**
 * Escolhe o que cabe no orçamento, em duas passadas.
 *
 * A primeira limita quantos trechos cada documento pode ocupar: sem isso, um
 * calendário anual longo tomaria o prompt inteiro e a resposta ficaria cega
 * para os outros documentos. A segunda gasta a sobra sem esse limite, porque
 * quando existe um só documento relevante o certo é aprofundar nele.
 */
function select(ranked: RetrievedChunk[], budget: Budget): RetrievedChunk[] {
  const chosen: RetrievedChunk[] = [];
  const perDocument = new Map<string, number>();
  let used = 0;

  const room = budget.chars * (1 - EXPANSION_SHARE);

  const take = (chunk: RetrievedChunk) => {
    chosen.push(chunk);
    perDocument.set(chunk.documentId, (perDocument.get(chunk.documentId) ?? 0) + 1);
    used += chunk.content.length;
  };

  for (const chunk of ranked) {
    if (chosen.length >= budget.maxChunks || used >= room) break;
    if ((perDocument.get(chunk.documentId) ?? 0) >= budget.perDocument) continue;
    take(chunk);
  }

  const seen = new Set(chosen.map((c) => c.chunkId));
  for (const chunk of ranked) {
    if (chosen.length >= budget.maxChunks || used >= room) break;
    if (seen.has(chunk.chunkId)) continue;
    take(chunk);
  }

  return chosen;
}

/**
 * Completa o contexto dos trechos escolhidos com os vizinhos imediatos.
 *
 * Uma tabela de cronograma quase sempre cruza a fronteira entre dois trechos:
 * o cabeçalho ("2ª chamada — Fundamental II") fica num, as linhas com as datas
 * no outro. Recuperar o trecho certo e mesmo assim responder errado por falta
 * do vizinho é o modo de falha mais chato de diagnosticar, porque a busca
 * parece ter funcionado.
 *
 * Custa uma consulta a mais, por chave primária, e só gasta a sobra do
 * orçamento — o que já foi escolhido pela relevância nunca é descartado.
 */
async function expand(
  chosen: RetrievedChunk[],
  ranked: RetrievedChunk[],
  budget: Budget,
  visibility: SQL,
): Promise<RetrievedChunk[]> {
  if (chosen.length === 0) return chosen;

  let used = chosen.reduce((n, c) => n + c.content.length, 0);
  if (used >= budget.chars) return order(chosen);

  const documentIds = [...new Set(chosen.map((c) => c.documentId))];
  const have = new Set(chosen.map((c) => c.chunkId));

  // Ordinais vizinhos dos que já entraram, por documento.
  const wanted = new Map<string, Set<number>>();
  for (const chunk of chosen) {
    const set = wanted.get(chunk.documentId) ?? new Set<number>();
    set.add(chunk.ordinal - 1);
    set.add(chunk.ordinal + 1);
    wanted.set(chunk.documentId, set);
  }

  const rows = await db.execute<RawRow>(sql`
    SELECT ${SELECTION}
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE ${visibility}
      AND c.document_id IN (${sql.join(
        documentIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    ORDER BY c.document_id, c.ordinal
  `);

  // A ordem de preferência é a do documento mais bem colocado.
  const documentRank = new Map<string, number>();
  ranked.forEach((c, index) => {
    if (!documentRank.has(c.documentId)) documentRank.set(c.documentId, index);
  });

  const neighbours = [...rows]
    .filter((row) => !have.has(row.chunk_id) && wanted.get(row.document_id)?.has(row.ordinal))
    .sort(
      (a, b) =>
        (documentRank.get(a.document_id) ?? 1e9) - (documentRank.get(b.document_id) ?? 1e9) ||
        a.ordinal - b.ordinal,
    );

  const extra: RetrievedChunk[] = [];
  for (const row of neighbours) {
    if (used + row.content.length > budget.chars) continue;
    // Herda a pontuação do documento para não subverter a ordenação final.
    const parent = chosen.find((c) => c.documentId === row.document_id)!;
    extra.push(toChunk(row, parent.score * 0.9));
    used += row.content.length;
  }

  return order([...chosen, ...extra]);
}

/**
 * Ordena por documento (o mais relevante primeiro) e, dentro de cada um, na
 * ordem em que o texto aparece. Intercalar trechos de documentos diferentes
 * por score puro dá ao modelo um contexto picotado e mais difícil de citar.
 */
function order(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const best = new Map<string, number>();
  for (const chunk of chunks) {
    best.set(chunk.documentId, Math.max(best.get(chunk.documentId) ?? 0, chunk.score));
  }

  return [...chunks].sort(
    (a, b) =>
      (best.get(b.documentId) ?? 0) - (best.get(a.documentId) ?? 0) ||
      a.documentId.localeCompare(b.documentId) ||
      a.ordinal - b.ordinal,
  );
}
