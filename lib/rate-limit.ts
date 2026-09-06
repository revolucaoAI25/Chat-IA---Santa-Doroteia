import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  retryAfterSeconds: number;
}

const WINDOW_MINUTES = Number(process.env.CHAT_RATE_WINDOW_MINUTES ?? 10);
const MAX_QUESTIONS = Number(process.env.CHAT_RATE_MAX_QUESTIONS ?? 20);

/**
 * Limite de perguntas por usuário numa janela deslizante.
 *
 * Conta as mensagens que a pessoa já gravou, em vez de manter um contador
 * próprio: não precisa de tabela nova, sobrevive a reinício de processo e
 * funciona igual em várias instâncias serverless — que é onde um contador em
 * memória falharia.
 *
 * Serve contra uso acidental em excesso e contra uma conta comprometida
 * queimar a cota da OpenAI. Não é proteção contra ataque distribuído.
 */
export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [row] = await db
    .select({ total: count() })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.userId, userId),
        eq(messages.role, 'user'),
        gte(messages.createdAt, since),
      ),
    );

  const used = row?.total ?? 0;

  return {
    allowed: used < MAX_QUESTIONS,
    used,
    limit: MAX_QUESTIONS,
    retryAfterSeconds: WINDOW_MINUTES * 60,
  };
}

/** Marca a última interação da pessoa, para o relatório de uso. */
export async function touchUser(userId: string): Promise<void> {
  await db.execute(sql`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`);
}
