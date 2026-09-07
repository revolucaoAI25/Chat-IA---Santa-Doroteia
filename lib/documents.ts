import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentVisibilityFilter } from '@/lib/rag/access';
import type { SessionUser } from '@/lib/auth/session';
import type { DocumentTypeValue, Segment } from '@/lib/db/schema';

/**
 * Acervo visível para quem está logado — a mesma lista que a IA pode consultar.
 *
 * Passa pelo `documentVisibilityFilter`, e não por uma consulta própria, porque
 * a tela de Documentos e a busca do chat têm de concordar: um documento que
 * aparece aqui é citável na resposta, e um que não aparece não é. Duas regras
 * separadas divergiriam no primeiro ajuste de acesso.
 */

export interface LibraryDocument {
  id: string;
  title: string;
  type: DocumentTypeValue;
  docNumber: number | null;
  summary: string | null;
  anoLetivo: number | null;
  etapa: string | null;
  segments: Segment[];
  series: string[];
  audience: string[];
  validUntil: string | null;
  pageCount: number | null;
  /** ISO. É a data de entrada no sistema, usada para ordenar a lista. */
  createdAt: string;
}

interface Row extends Record<string, unknown> {
  id: string;
  title: string;
  type: DocumentTypeValue;
  doc_number: number | null;
  summary: string | null;
  ano_letivo: number | null;
  etapa: string | null;
  segments: Segment[];
  series: string[];
  audience: string[];
  valid_until: string | null;
  page_count: number | null;
  created_at: Date;
}

export async function listVisibleDocuments(
  user: SessionUser,
  limit = 300,
): Promise<LibraryDocument[]> {
  const rows = await db.execute<Row>(sql`
    SELECT
      d.id, d.title, d.type::text AS type, d.doc_number, d.summary,
      d.ano_letivo, d.etapa, d.segments, d.series, d.audience,
      d.valid_until, d.page_count, d.created_at
    FROM documents d
    WHERE ${documentVisibilityFilter(user, 'd')}
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);

  return [...rows].map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    docNumber: row.doc_number,
    summary: row.summary,
    anoLetivo: row.ano_letivo,
    etapa: row.etapa,
    // Colunas de array vêm como `null` quando o driver não consegue inferir o
    // tipo; a lista vazia é o valor correto e significa "vale para toda a escola".
    segments: row.segments ?? [],
    series: row.series ?? [],
    audience: row.audience ?? [],
    validUntil: row.valid_until,
    pageCount: row.page_count,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
