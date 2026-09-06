import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL não está definida. Copie .env.example para .env.local e preencha a string de conexão do Supabase.',
  );
}

/**
 * O pooler de transações do Supabase (porta 6543) não suporta prepared
 * statements, e é o modo correto para funções serverless. Detectamos a porta
 * para escolher o comportamento certo sem exigir configuração extra.
 */
const usesTransactionPooler = connectionString.includes(':6543');

const globalForDb = globalThis as unknown as {
  __sqlClient?: ReturnType<typeof postgres>;
};

// Em dev o hot reload reavalia o módulo; reaproveitar o socket evita
// esgotar as conexões do Postgres.
const client =
  globalForDb.__sqlClient ??
  postgres(connectionString, {
    prepare: !usesTransactionPooler,
    max: usesTransactionPooler ? 1 : 10,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__sqlClient = client;
}

export const db = drizzle(client, { schema, casing: 'snake_case' });
export const sqlClient = client;
export { schema };
