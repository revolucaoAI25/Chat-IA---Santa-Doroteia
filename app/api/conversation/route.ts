import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { envNumber } from '@/lib/env';

export const runtime = 'nodejs';

/** Depois disto a thread é considerada encerrada — igual à regra do /api/chat. */
const CONVERSATION_IDLE_HOURS = envNumber('CONVERSATION_IDLE_HOURS', 24);

/**
 * Devolve as mensagens de uma conversa em andamento.
 *
 * Existe para o caso de a pessoa navegar para outra tela e voltar, ou dar um
 * F5: o servidor continuaria com o histórico da thread, e sem isto a tela
 * voltaria vazia — a IA lembraria da conversa e o usuário não veria nada, o que
 * é pior do que recomeçar.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 });
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
    columns: { id: true, userId: true, lastMessageAt: true, createdAt: true },
  });

  // Conversa de outra pessoa: 404, e não 403 — conhecer o id não é evidência
  // de que ela existe.
  if (!conversation || conversation.userId !== user.id) {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  }

  const last = conversation.lastMessageAt ?? conversation.createdAt;
  const idleHours = (Date.now() - last.getTime()) / 3_600_000;
  if (idleHours > CONVERSATION_IDLE_HOURS) {
    // Encerrada por inatividade: o cliente deve começar do zero.
    return NextResponse.json({ expired: true, messages: [] });
  }

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      feedback: messages.feedback,
    })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .limit(200);

  return NextResponse.json({ expired: false, messages: rows });
}
