import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/page-header';
import { serieLabel } from '@/lib/taxonomy';
import { ChatClient } from './chat-client';

export const metadata = { title: 'Assistente · Colégio Santa Dorotéia' };

/**
 * As sugestões mudam com o perfil, pelo mesmo motivo que o prompt muda: um
 * aluno do 7º ano e um professor não chegam ao chat com as mesmas dúvidas.
 */
function suggestionsFor(role: string, serie: string | null): string[] {
  if (role === 'professor' || role === 'coordenacao') {
    return [
      'Quais são os prazos internos de lançamento de notas desta etapa?',
      'Como devem ser elaboradas as avaliações da 3ª etapa?',
      'Quando é o conselho de classe?',
    ];
  }
  if (role === 'admin') {
    return [
      'Quais documentos falam sobre recuperação?',
      'Quais eventos estão previstos para os próximos meses?',
      'Como funciona o controle de acesso do colégio?',
    ];
  }
  return [
    serie ? `Quais são as próximas provas do ${serieLabel(serie)}?` : 'Quais são as próximas avaliações?',
    'O que cai na prova de matemática?',
    'Quando é a reunião de pais?',
  ];
}

export default async function ChatPage() {
  const user = await requireSession();

  return (
    <>
      <PageHeader area="Assistente" subtitle="Como posso ajudar hoje?" />
      <ChatClient user={user} suggestions={suggestionsFor(user.role, user.serie)} />
    </>
  );
}
