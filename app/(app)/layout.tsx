import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');

  // A marca vem do tenant, não de constante no código: é o que torna a
  // instalação whitelabel.
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
    columns: { logoUrl: true },
  });

  return (
    // Altura travada na viewport: quem rola é a área de conteúdo de cada tela,
    // e não a página. É o que mantém o campo de pergunta sempre visível numa
    // conversa longa.
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} logoUrl={tenant?.logoUrl} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
