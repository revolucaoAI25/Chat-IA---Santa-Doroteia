import { redirect } from 'next/navigation';
import { count, desc, eq, sql } from 'drizzle-orm';
import { requireSession, isAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { documentChunks, documentEvents, documents } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { DEMO_MODE } from '@/lib/ai/provider';
import { storageDriver } from '@/lib/storage';
import { IngestClient } from './ingest-client';

export const metadata = { title: 'Administração · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireSession();
  if (!isAdmin(user)) redirect('/chat');

  const [[stats], recent, [pendingReview]] = await Promise.all([
    db
      .select({
        total: count(),
        vigentes: sql<number>`count(*) FILTER (WHERE ${documents.validUntil} IS NULL OR ${documents.validUntil} >= CURRENT_DATE)`.mapWith(
          Number,
        ),
        vencidos: sql<number>`count(*) FILTER (WHERE ${documents.validUntil} < CURRENT_DATE)`.mapWith(
          Number,
        ),
        aVencer: sql<number>`count(*) FILTER (WHERE ${documents.validUntil} BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)`.mapWith(
          Number,
        ),
      })
      .from(documents)
      .where(eq(documents.tenantId, user.tenantId)),

    db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        docNumber: documents.docNumber,
        segments: documents.segments,
        series: documents.series,
        anoLetivo: documents.anoLetivo,
        validUntil: documents.validUntil,
        audience: documents.audience,
        usedOcr: documents.usedOcr,
        createdAt: documents.createdAt,
        chunkCount: sql<number>`(SELECT count(*) FROM ${documentChunks} WHERE ${documentChunks.documentId} = ${documents.id})`.mapWith(
          Number,
        ),
        eventCount: sql<number>`(SELECT count(*) FROM ${documentEvents} WHERE ${documentEvents.documentId} = ${documents.id})`.mapWith(
          Number,
        ),
      })
      .from(documents)
      .where(eq(documents.tenantId, user.tenantId))
      .orderBy(desc(documents.createdAt))
      .limit(12),

    db
      .select({ total: count() })
      .from(documentEvents)
      .where(sql`${documentEvents.tenantId} = ${user.tenantId} AND ${documentEvents.review} = 'a_revisar'`),
  ]);

  return (
    <>
      <PageHeader area="Administração" />
      <IngestClient
        stats={{ ...stats, pendingReview: pendingReview.total }}
        recent={recent.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() }))}
        demoMode={DEMO_MODE}
        storage={storageDriver()}
      />
    </>
  );
}
