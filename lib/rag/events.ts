import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { documentVisibilityFilter } from './access';
import { EVENT_TYPE_LABELS, serieLabel } from '@/lib/taxonomy';

export interface UpcomingEvent {
  id: string;
  documentId: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn: string | null;
  startsAtTime: string | null;
  subject: string | null;
  chamada: number | null;
  series: string[];
  documentTitle: string;
  review: string;
}

interface EventRow extends Record<string, unknown> {
  id: string;
  document_id: string;
  title: string;
  type: string;
  starts_on: string;
  ends_on: string | null;
  starts_at_time: string | null;
  subject: string | null;
  chamada: number | null;
  series: string[];
  document_title: string;
  review: string;
}

/**
 * Agenda estruturada de quem está perguntando.
 *
 * Perguntas de data ("quando é a próxima prova?", "o que tem essa semana?")
 * são as mais frequentes e as que a busca por similaridade responde pior: o
 * trecho recuperado pode conter a tabela inteira do 6º ao 9º ano, e cabe ao
 * modelo achar a linha certa e ordenar por data — que é justamente o tipo de
 * coisa que ele erra.
 *
 * Aqui o banco faz esse trabalho: filtra por série, corta o passado e ordena.
 * O modelo recebe uma lista pequena e já correta.
 *
 * Só entram eventos com `review = 'ativo'`. O que a IA extraiu com pouca
 * confiança está em `a_revisar` e **não** é apresentado como fato até um humano
 * conferir.
 */
export async function upcomingEvents(
  user: SessionUser,
  limit = 25,
  windowDays = 120,
): Promise<UpcomingEvent[]> {
  const visibility = documentVisibilityFilter(user, 'd');

  // O recorte por série do evento é adicional ao do documento: um cronograma
  // visível para o Fundamental II inteiro tem linhas de cada ano, e o aluno do
  // 7º só deve ver as dele.
  const series = [user.serie, ...user.extraSeries].filter(Boolean) as string[];
  const seriesFilter =
    user.role === 'aluno' && series.length > 0
      ? sql`AND (cardinality(e.series) = 0 OR e.series && ARRAY[${sql.join(
          series.map((s) => sql`${s}`),
          sql`, `,
        )}]::text[])`
      : sql``;

  const rows = await db.execute<EventRow>(sql`
    SELECT
      e.id, e.document_id, e.title, e.type::text AS type,
      e.starts_on, e.ends_on, e.starts_at_time, e.subject, e.chamada,
      e.series, e.review::text AS review,
      d.title AS document_title
    FROM document_events e
    JOIN documents d ON d.id = e.document_id
    WHERE ${visibility}
      AND e.review = 'ativo'
      AND COALESCE(e.ends_on, e.starts_on) >= CURRENT_DATE
      AND e.starts_on <= CURRENT_DATE + ${windowDays}::int
      ${seriesFilter}
    ORDER BY e.starts_on ASC, e.starts_at_time ASC NULLS LAST
    LIMIT ${limit}
  `);

  return [...rows].map((row) => ({
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    type: row.type,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startsAtTime: row.starts_at_time,
    subject: row.subject,
    chamada: row.chamada,
    series: row.series ?? [],
    documentTitle: row.document_title,
    review: row.review,
  }));
}

/** Formata a agenda como texto para entrar no prompt. */
export function formatEventsForPrompt(events: UpcomingEvent[]): string {
  if (events.length === 0) return '';

  const lines = events.map((event) => {
    const when = formatRange(event.startsOn, event.endsOn);
    const parts = [
      `${when}${event.startsAtTime ? ` às ${event.startsAtTime}` : ''}`,
      `${EVENT_TYPE_LABELS[event.type] ?? event.type}: ${event.title}`,
    ];
    if (event.subject) parts.push(`matéria: ${event.subject}`);
    if (event.chamada) parts.push(`${event.chamada}ª chamada`);
    if (event.series.length) parts.push(event.series.map(serieLabel).join(', '));
    parts.push(`fonte: ${event.documentTitle}`);
    return `- ${parts.join(' · ')}`;
  });

  return lines.join('\n');
}

function formatRange(startsOn: string, endsOn: string | null): string {
  const start = formatDate(startsOn);
  if (!endsOn || endsOn === startsOn) return start;
  return `${start} a ${formatDate(endsOn)}`;
}

function formatDate(iso: string): string {
  // Meio-dia UTC evita que o fuso empurre a data para o dia anterior.
  const date = new Date(`${iso}T12:00:00Z`);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
