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
import { UsersClient, type AdminUser } from './users-client';
import { SettingsClient } from './settings-client';
import { users as usersTable } from '@/lib/db/schema';
import { effectiveSerie } from '@/lib/series-progression';
import { currentAnoLetivo } from '@/lib/academic-calendar';
import { asc } from 'drizzle-orm';

export const metadata = { title: 'Administração · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'ingestao', label: 'Ingestão' },
  { key: 'usuarios', label: 'Usuários' },
  { key: 'configuracoes', label: 'Configurações' },
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
        <div className="mx-auto w-full max-w-[64rem] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-7">
          <nav
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Seções da administração"
          >
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/admin?tab=${t.key}`}
                aria-current={active === t.key ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[0.8125rem] font-bold transition-colors sm:px-5 sm:py-2.5 sm:text-[0.875rem] ${
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
            ) : active === 'usuarios' ? (
              <UsersTab tenantId={user.tenantId} />
            ) : active === 'configuracoes' ? (
              <SettingsTab tenantId={user.tenantId} />
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

async function UsersTab({ tenantId }: { tenantId: string }) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId))
    .orderBy(asc(usersTable.role), asc(usersTable.name));

  const list: AdminUser[] = rows.map((u) => {
    // A linha mostra as duas coisas: a série cadastrada e a vigente depois do
    // avanço automático. Sem isso, o administrador não entende por que o aluno
    // aparece numa série diferente da que ele digitou.
    const effective = effectiveSerie(u.serie, u.serieAnoLetivo);
    return {
      id: u.id,
      name: u.name,
      matricula: u.matricula,
      email: u.email,
      role: u.role,
      serie: u.serie,
      serieVigente: effective.serie,
      serieAnoLetivo: u.serieAnoLetivo,
      turma: u.turma,
      segment: effective.segment ?? u.segment,
      extraSeries: u.extraSeries,
      disciplinas: u.disciplinas,
      seriesTaught: u.seriesTaught,
      segmentsTaught: u.segmentsTaught,
      active: u.active,
      concluido: effective.concluido,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    };
  });

  return <UsersClient users={list} anoLetivo={currentAnoLetivo()} />;
}

async function SettingsTab({ tenantId }: { tenantId: string }) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { settings: true },
  });

  return <SettingsClient settings={tenant?.settings ?? {}} />;
}
