import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { AppShell } from '@/components/app-shell';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { brandingStyle, logoSize } from '@/lib/branding';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');

  // A marca vem do tenant, não de constante no código: é o que torna a
  // instalação whitelabel.
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
    columns: { logoUrl: true, branding: true, displayName: true },
  });

  return (
    // A altura travada na viewport faz a área de conteúdo rolar, e não a
    // página — é o que mantém o campo de pergunta visível numa conversa longa.
    // `style` traz as CSS variables do tenant, que repintam toda a árvore.
    <AppShell
      user={user}
      logoUrl={tenant?.logoUrl}
      logoSize={logoSize(tenant?.branding)}
      schoolName={tenant?.displayName ?? ''}
      style={brandingStyle(tenant?.branding)}
      banner={<ImpersonationBanner user={user} />}
    >
      {children}
    </AppShell>
  );
}
