import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { conversations, messages, tenants } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { retrieve } from '@/lib/rag/retrieve';
import { streamAnswer } from '@/lib/rag/answer';
import { planQuery } from '@/lib/rag/plan';
import { upcomingEvents } from '@/lib/rag/events';
import { checkChatRateLimit, touchUser } from '@/lib/rate-limit';

// A busca vetorial e a geração precisam do runtime Node (driver Postgres).
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Depois deste tempo sem interação, a próxima pergunta começa uma conversa
 * nova. Retomar uma thread de ontem traria contexto que a pessoa já esqueceu —
 * e a IA trataria como se a conversa nunca tivesse parado.
 */
const CONVERSATION_IDLE_HOURS = Number(process.env.CONVERSATION_IDLE_HOURS ?? 24);

/**
 * Teto de segurança do contexto, em caracteres.
 *
 * A conversa NÃO é cortada num número fixo de turnos: enquanto a pessoa estiver
 * conversando, o encadeamento inteiro vai junto — é o que ela espera ao dizer
 * "e a de história?" cinco perguntas depois. Este limite existe só para uma
 * conversa muito longa não crescer sem fim; ~24 mil caracteres são cerca de 6
 * mil tokens, o que cabe com folga ao lado dos trechos dos documentos.
 */
const HISTORY_CHAR_BUDGET = 24_000;

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

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
    columns: { settings: true },
  });
  const settings = tenant?.settings ?? null;

  /*
   * Qual conversa continuar.
   *
   * A thread é sempre relida com o dono conferido — um id de outra pessoa não
   * pode ser reaproveitado para ler ou escrever histórico alheio. E uma thread
   * parada há mais de CONVERSATION_IDLE_HOURS é aposentada: a pergunta de hoje
   * não é continuação da conversa de ontem.
   */
  let conversationId = parsed.data.conversationId ?? null;

  if (conversationId) {
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: { id: true, userId: true, lastMessageAt: true, createdAt: true },
    });

    if (!existing || existing.userId !== user.id) {
      conversationId = null;
    } else {
      const last = existing.lastMessageAt ?? existing.createdAt;
      const idleHours = (Date.now() - last.getTime()) / 3_600_000;
      if (idleHours > CONVERSATION_IDLE_HOURS) conversationId = null;
    }
  }

  if (!conversationId) {
    const [created] = await db
      .insert(conversations)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        title: question.slice(0, 80),
        lastMessageAt: new Date(),
      })
      .returning({ id: conversations.id });
    conversationId = created.id;
  }

  const history = await loadHistory(conversationId);

  await db.insert(messages).values({ conversationId, role: 'user', content: question });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  void touchUser(user.id);

  // 1. Planejar: resolver follow-up e decidir se vale perguntar de volta.
  const plan = await planQuery({ user, question, history, settings });

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

          const [saved] = await db
            .insert(messages)
            .values({
              conversationId: conversation,
              role: 'assistant',
              content: text,
              citations: [],
              searchQuery: plan.searchQuery,
              wasClarification: true,
              latencyMs: Date.now() - startedAt,
              model: 'planner',
            })
            .returning({ id: messages.id });

          send({
            type: 'done',
            citations: [],
            messageId: saved.id,
            usage: { promptTokens: null, completionTokens: null, model: 'planner' },
          });
          return;
        }

        // 3. Buscar. Os documentos são consultados SEMPRE, inclusive nas
        //    perguntas de data; a agenda é um reforço, não um substituto.
        const wantsAgenda = plan.intent === 'agenda' || plan.intent === 'ambos';
        const [chunks, events] = await Promise.all([
          retrieve(user, plan.searchQuery, {
            variants: plan.altQueries,
            breadth: plan.breadth,
          }),
          // Pergunta de panorama merece uma janela maior de agenda: "o que vem
          // pela frente neste semestre" não cabe em 120 dias.
          wantsAgenda
            ? upcomingEvents(user, plan.breadth === 'amplo' ? 60 : 25, plan.breadth === 'amplo' ? 240 : 120)
            : Promise.resolve([]),
        ]);

        let answer = '';

        for await (const event of streamAnswer({
          user,
          question,
          chunks,
          history,
          events,
          assumption: plan.assumption,
          settings,
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
              .set({ lastMessageAt: new Date(), updatedAt: new Date() })
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

/**
 * Histórico da conversa, do mais antigo para o mais novo.
 *
 * Busca do fim para o começo e para quando estoura o orçamento de caracteres,
 * então uma conversa curta vai inteira e uma longuíssima perde só o começo —
 * que é a parte menos relevante para entender a pergunta atual.
 */
async function loadHistory(
  conversationId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(60);

  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let budget = HISTORY_CHAR_BUDGET;

  for (const row of rows) {
    budget -= row.content.length;
    if (budget < 0 && kept.length > 0) break;
    kept.push(row);
  }

  return kept.reverse();
}
