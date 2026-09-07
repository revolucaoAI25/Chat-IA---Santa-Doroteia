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
  /** Marca explícita: série e segmento passam a esconder, não só a classificar. */
  restrictToScope: boolean;
  validFrom: string | null;
  validUntil: string | null;
  pageCount: number | null;
  /** Data impressa no cabeçalho do documento. É a que identifica o comunicado. */
  documentDate: string | null;
  /** ISO. Entrada no sistema — só usada quando não há data no cabeçalho. */
  createdAt: string;
  /**
   * Fora de vigência: não responde no chat e ninguém além do administrador o vê.
   * Só chega a ser `true` na listagem do administrador.
   */
  hidden: boolean;
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
  restrict_to_scope: boolean;
  valid_from: string | null;
  valid_until: string | null;
  page_count: number | null;
  document_date: string | null;
  created_at: Date;
  hidden: boolean;
}

export async function listVisibleDocuments(
  user: SessionUser,
  limit = 300,
): Promise<LibraryDocument[]> {
  /*
   * O administrador vê também o que está fora de vigência.
   *
   * Esta é a única tela onde se acha um documento específico no acervo inteiro
   * — e o documento que mais precisa de conserto é justamente o que já saiu do
   * ar: a data lida errado do cabeçalho o venceu antes da hora, ou ele deveria
   * ter sido apagado e ninguém mais consegue chegar nele. Escondê-lo aqui
   * tornaria o erro irreversível pela interface.
   *
   * Cada um desses vem marcado com `hidden`, e o cartão diz na cara que o
   * documento não responde no chat. A promessa da tela ("são as fontes que o
   * assistente usa") continua de pé porque a exceção está rotulada.
   */
  const scope =
    user.role === 'admin'
      ? sql`d.tenant_id = ${user.tenantId} AND d.status = 'ready'`
      : documentVisibilityFilter(user, 'd');

  const rows = await db.execute<Row>(sql`
    SELECT
      d.id, d.title, d.type::text AS type, d.doc_number, d.summary,
      d.ano_letivo, d.etapa, d.segments, d.series, d.audience,
      d.restrict_to_scope, d.valid_from, d.valid_until,
      d.page_count, d.document_date, d.created_at,
      (
        (d.valid_until IS NOT NULL AND d.valid_until < CURRENT_DATE)
        OR (d.valid_from IS NOT NULL AND d.valid_from > CURRENT_DATE)
      ) AS hidden
    FROM documents d
    WHERE ${scope}
    -- Ordenado pela data do próprio documento, não pela de upload: numa
    -- importação de acervo antigo, tudo entra no mesmo dia e a ordem de
    -- chegada não diz nada a quem procura o comunicado mais recente.
    ORDER BY COALESCE(d.document_date, d.created_at::date) DESC, d.created_at DESC
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
    restrictToScope: row.restrict_to_scope,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    pageCount: row.page_count,
    documentDate: row.document_date,
    createdAt: new Date(row.created_at).toISOString(),
    hidden: row.hidden === true,
  }));
}
