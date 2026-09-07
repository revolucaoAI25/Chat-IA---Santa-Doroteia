import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Conexão com o banco, criada sob demanda.
 *
 * A inicialização é preguiçosa de propósito: o `next build` importa cada rota
 * para ler a configuração dela, e se este módulo exigisse `DATABASE_URL` já na
 * avaliação, **o build inteiro falharia sem nenhuma credencial configurada** —
 * que é exatamente o estado de um primeiro deploy. Segredo é coisa de runtime,
 * não de build.
 *
 * Com isto, faltar a variável vira um erro claro na primeira consulta, e não um
 * deploy quebrado com a mensagem enterrada em "Collecting page data".
 */

type Database = ReturnType<typeof createDatabase>;

const globalForDb = globalThis as unknown as {
  __sqlClient?: ReturnType<typeof postgres>;
  __db?: Database;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não está definida. Em desenvolvimento, copie .env.example ' +
        'para .env.local; na Vercel, configure a variável de ambiente e refaça o deploy.',
    );
  }
  return url;
}

function createClient() {
  const url = connectionString();

  /*
   * O pooler de transações do Supabase (porta 6543) não suporta prepared
   * statements, e é o modo correto para funções serverless. Detectamos a porta
   * para escolher o comportamento certo sem exigir configuração extra.
   */
  const usesTransactionPooler = url.includes(':6543');

  return postgres(url, {
    prepare: !usesTransactionPooler,
    max: usesTransactionPooler ? 1 : 10,
    idle_timeout: 20,
  });
}

function createDatabase() {
  // O cliente fica no escopo global sempre, não só em dev: em dev isso evita
  // que o hot reload abra um socket novo a cada recarga, e em produção é o que
  // permite a `sqlClient()` devolver a MESMA conexão que o `db` está usando —
  // senão encerrá-la não encerraria nada.
  globalForDb.__sqlClient ??= createClient();
  return drizzle(globalForDb.__sqlClient, { schema, casing: 'snake_case' });
}

function getDb(): Database {
  globalForDb.__db ??= createDatabase();
  return globalForDb.__db;
}

/**
 * Proxy para manter a ergonomia de `db.select()` sem conectar na importação.
 * Os métodos são religados ao alvo real, senão perderiam o `this`.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
}) as Database;

/** Cliente cru, para os scripts que precisam encerrar a conexão ao terminar. */
export function sqlClient() {
  getDb();
  return globalForDb.__sqlClient!;
}

export { schema };
