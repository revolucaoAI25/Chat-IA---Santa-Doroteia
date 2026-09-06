'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { segment as segmentEnum, users, type Segment } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/session';
import { SERIES } from '@/lib/taxonomy';

const SERIE_VALUES = new Set(SERIES.map((s) => s.value));
const MAX_NOTE = 400;

export interface ProfileState {
  error?: string;
  saved?: boolean;
}

/**
 * Atualiza o contexto acadêmico da própria pessoa.
 *
 * Regra importante: um aluno NÃO pode mudar a própria série, porque a série é
 * o que recorta o acesso aos documentos — deixar isso editável seria entregar
 * a chave do cofre. Aluno edita só a observação livre, que vai para o prompt e
 * nunca para o filtro. Série e turma de aluno são responsabilidade da
 * secretaria (tela de Usuários).
 *
 * Professores editam disciplinas, segmentos e séries acompanhadas: para eles
 * esses campos não ampliam acesso (professor já enxerga todas as séries), só
 * afinam o contexto da IA.
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireSession();

  const contextNote = String(formData.get('contextNote') ?? '').trim().slice(0, MAX_NOTE);

  const patch: Partial<typeof users.$inferInsert> = {
    contextNote: contextNote || null,
    contextUpdatedAt: new Date(),
  };

  if (user.role === 'professor' || user.role === 'coordenacao' || user.role === 'admin') {
    const disciplinas = formData
      .getAll('disciplinas')
      .map((d) => String(d).trim())
      .filter((d) => d.length > 0 && d.length <= 60)
      .slice(0, 12);

    const segmentsTaught = formData
      .getAll('segmentsTaught')
      .map(String)
      .filter((s): s is Segment => (segmentEnum.enumValues as readonly string[]).includes(s));

    const extraSeries = formData
      .getAll('extraSeries')
      .map(String)
      .filter((s) => SERIE_VALUES.has(s));

    patch.disciplinas = disciplinas;
    patch.segmentsTaught = segmentsTaught;
    patch.extraSeries = extraSeries;
  }

  await db.update(users).set(patch).where(eq(users.id, user.id));

  // A sessão é lida do banco a cada requisição, então não há cookie para
  // reemitir: basta invalidar o cache das telas que mostram o contexto.
  revalidatePath('/perfil');
  revalidatePath('/chat');

  return { saved: true };
}
