import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

const bodySchema = z.object({
  messageId: z.string().uuid(),
  feedback: z.enum(['util', 'nao_util']),
  note: z.string().max(500).optional(),
});

/**
 * Registra se a resposta serviu.
 *
 * As respostas marcadas como não úteis são a matéria-prima do relatório de
 * "lacunas de informação" pedido na especificação: são exatamente as perguntas
 * que o acervo ainda não responde. `search_query` fica gravado junto, então dá
 * para ver o que a busca procurou quando falhou.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const { messageId, feedback, note } = parsed.data;

  // Só o dono da conversa avalia a própria resposta — o join garante isso na
  // consulta, em vez de confiar no id que veio do cliente.
  const target = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, messageId), eq(conversations.userId, user.id)))
    .limit(1);

  if (target.length === 0) {
    return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  }

  await db
    .update(messages)
    .set({ feedback, feedbackNote: note ?? null, feedbackAt: new Date() })
    .where(eq(messages.id, messageId));

  return NextResponse.json({ ok: true });
}
