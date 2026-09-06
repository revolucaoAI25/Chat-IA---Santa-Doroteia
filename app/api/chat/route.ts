import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { retrieve } from '@/lib/rag/retrieve';
import { streamAnswer } from '@/lib/rag/answer';
import { planQuery } from '@/lib/rag/plan';
import { upcomingEvents } from '@/lib/rag/events';
import { checkChatRateLimit, touchUser } from '@/lib/rate-limit';

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

  const limit = await checkChatRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error:
          `Você fez ${limit.used} perguntas em pouco tempo. ` +
          'Aguarde alguns minutos para continuar.',
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
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
  void touchUser(user.id);

  // 1. Planejar: resolver follow-up e decidir se vale perguntar de volta.
  const plan = await planQuery({ user, question, history });

  const encoder = new TextEncoder();
  const conversation = conversationId;

  // Protocolo NDJSON: uma linha por evento. Mais simples de consumir que SSE e
  // suficiente, já que o fluxo é unidirecional.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      send({ type: 'start', conversationId: conversation });

      try {
        // 2. Ambíguo demais: perguntar de volta em vez de chutar. O planejador
        //    é deliberadamente conservador, então isso é raro.
        if (plan.needsClarification && plan.clarifyingQuestion) {
          const text = plan.clarifyingQuestion;
          send({ type: 'delta', text });
          send({ type: 'clarify', options: plan.clarifyOptions });

          await db.insert(messages).values({
            conversationId: conversation,
            role: 'assistant',
            content: text,
            citations: [],
            searchQuery: plan.searchQuery,
            wasClarification: true,
            latencyMs: Date.now() - startedAt,
            model: 'planner',
          });

          send({
            type: 'done',
            citations: [],
            usage: { promptTokens: null, completionTokens: null, model: 'planner' },
          });
          return;
        }

        // 3. Buscar. A agenda só é consultada quando a pergunta é de data —
        //    é uma consulta a mais, não vale pagar em toda pergunta.
        const wantsAgenda = plan.intent === 'agenda' || plan.intent === 'ambos';
        const [chunks, events] = await Promise.all([
          retrieve(user, plan.searchQuery),
          wantsAgenda ? upcomingEvents(user) : Promise.resolve([]),
        ]);

        let answer = '';

        for await (const event of streamAnswer({
          user,
          question,
          chunks,
          history,
          events,
          assumption: plan.assumption,
        })) {
          if (event.type === 'delta') {
            answer += event.text;
            send(event);
          } else {
            const [saved] = await db
              .insert(messages)
              .values({
                conversationId: conversation,
                role: 'assistant',
                content: answer,
                citations: event.citations,
                searchQuery: plan.searchQuery,
                promptTokens: event.usage.promptTokens,
                completionTokens: event.usage.completionTokens,
                latencyMs: Date.now() - startedAt,
                model: event.usage.model,
              })
              .returning({ id: messages.id });

            await db
              .update(conversations)
              .set({ updatedAt: new Date() })
              .where(eq(conversations.id, conversation));

            // O id volta para o cliente poder registrar "útil / não útil".
            send({ ...event, messageId: saved.id });
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
