import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/page-header';
import { listVisibleDocuments } from '@/lib/documents';
import { DocumentsClient } from './documents-client';

export const metadata = { title: 'Documentos · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

/**
 * O acervo, aberto.
 *
 * O chat responde; esta tela deixa conferir. São coisas diferentes: quem quer
 * "a circular da formatura" não quer uma resposta redigida, quer o PDF. E ver a
 * lista inteira é o que mostra ao usuário que a IA não inventou a fonte — o
 * documento citado está aqui, com o mesmo recorte de acesso.
 */
export default async function DocumentosPage() {
  const user = await requireSession();
  const documents = await listVisibleDocuments(user);

  return (
    <>
      <PageHeader
        area="Documentos"
        subtitle={
          user.role === 'admin'
            ? 'O acervo inteiro — corrigir e excluir'
            : 'O que o seu acesso pode consultar'
        }
      />
      <DocumentsClient documents={documents} role={user.role} />
    </>
  );
}
