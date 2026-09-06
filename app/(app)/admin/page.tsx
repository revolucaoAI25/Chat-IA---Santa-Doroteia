import Link from 'next/link';
import { redirect } from 'next/navigation';
import { count, desc, eq, sql } from 'drizzle-orm';
import { requireSession, isAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { documentChunks, documentEvents, documents, tenants } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { DEMO_MODE } from '@/lib/ai/provider';
import { storageDriver } from '@/lib/storage';
import { IngestClient } from './ingest-client';
import { WhitelabelClient } from './whitelabel-client';

export const metadata = { title: 'Administração · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'ingestao', label: 'Ingestão' },
  { key: 'whitelabel', label: 'Whitelabel' },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireSession();
  if (!isAdmin(user)) redirect('/chat');

  const { tab } = await searchParams;
  const active = TABS.some((t) => t.key === tab) ? tab! : 'ingestao';

  return (
    <>
      <PageHeader area="Administração" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[64rem] px-10 pb-16 pt-7">
          <nav className="flex gap-2" aria-label="Seções da administração">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin?tab=${t.key}`}
                aria-current={active === t.key ? 'page' : undefined}
                className={`rounded-full border px-5 py-2.5 text-[0.875rem] font-bold transition-colors ${
                  active === t.key
                    ? 'border-navy bg-navy text-white'
                    : 'border-line-strong bg-surface text-ink hover:bg-chip-soft'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8">
            {active === 'whitelabel' ? (
              <WhitelabelTab tenantId={user.tenantId} />
            ) : (
              <IngestTab tenantId={user.tenantId} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

async function WhitelabelTab({ tenantId }: { tenantId: string }) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { displayName: true, logoUrl: true, branding: true },
  });

  return (
    <WhitelabelClient
      displayName={tenant?.displayName ?? ''}
      logoUrl={tenant?.logoUrl ?? null}
      branding={tenant?.branding ?? {}}
      storage={storageDriver()}
    />
  );
}

async function IngestTab({ tenantId }: { tenantId: string }) {
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
      .where(eq(documents.tenantId, tenantId)),

    db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        docNumber: documents.docNumber,
        segments: documents.segments,
        series: documents.series,
        anoLetivo: documents.anoLetivo,
        etapa: documents.etapa,
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
      .where(eq(documents.tenantId, tenantId))
      .orderBy(desc(documents.createdAt))
      .limit(12),

    db
      .select({ total: count() })
      .from(documentEvents)
      .where(sql`${documentEvents.tenantId} = ${tenantId} AND ${documentEvents.review} = 'a_revisar'`),
  ]);

  return (
    <IngestClient
      stats={{ ...stats, pendingReview: pendingReview.total }}
      recent={recent.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() }))}
      demoMode={DEMO_MODE}
      storage={storageDriver()}
    />
  );
}
