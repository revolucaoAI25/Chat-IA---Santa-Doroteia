import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { retrieve } from '@/lib/rag/retrieve';
import { streamAnswer } from '@/lib/rag/answer';

// A busca vetorial e a geração precisam do runtime Node (driver Postgres).
export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  conversationId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pergunta inválida.' }, { status: 400 });
  }

  const { question } = parsed.data;
  const startedAt = Date.now();

  // A conversa é sempre relida do banco com o dono conferido: um id de outra
  // pessoa não pode ser reaproveitado para ler ou escrever histórico alheio.
  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: { id: true, userId: true },
    });
    if (!existing || existing.userId !== user.id) conversationId = null;
  }

  if (!conversationId) {
    const [created] = await db
      .insert(conversations)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        title: question.slice(0, 80),
      })
      .returning({ id: conversations.id });
    conversationId = created.id;
  }

  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(20);

  await db.insert(messages).values({ conversationId, role: 'user', content: question });

  const chunks = await retrieve(user, question);

  const encoder = new TextEncoder();
  const conversation = conversationId;

  // Protocolo NDJSON: uma linha por evento. Mais simples de consumir que SSE e
  // suficiente, já que o fluxo é unidirecional.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      send({ type: 'start', conversationId: conversation });

      let answer = '';

      try {
        for await (const event of streamAnswer({ user, question, chunks, history })) {
          if (event.type === 'delta') {
            answer += event.text;
            send(event);
          } else {
            await db.insert(messages).values({
              conversationId: conversation,
              role: 'assistant',
              content: answer,
              citations: event.citations,
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              latencyMs: Date.now() - startedAt,
              model: event.usage.model,
            });
            await db
              .update(conversations)
              .set({ updatedAt: new Date() })
              .where(eq(conversations.id, conversation));

            send(event);
          }
        }
      } catch (error) {
        console.error('Falha ao responder:', error);
        send({
          type: 'error',
          message:
            error instanceof Error && error.message.includes('OPENAI_API_KEY')
              ? 'A chave da OpenAI não está configurada no servidor.'
              : 'Não consegui completar a resposta. Tente novamente em instantes.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Impede buffering em proxies, que anularia o streaming.
      'X-Accel-Buffering': 'no',
    },
  });
}
