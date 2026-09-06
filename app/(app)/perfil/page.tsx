import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/page-header';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Meu perfil · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireSession();

  return (
    <>
      <PageHeader area="Meu perfil" subtitle="O que o assistente sabe sobre você" />
      <ProfileForm user={user} />
    </>
  );
}
