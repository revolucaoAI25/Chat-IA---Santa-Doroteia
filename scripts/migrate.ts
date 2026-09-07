import './env';
import { runMigrations } from '@/lib/db/migrate';

/**
 * Aplica as migrações a partir da linha de comando.
 *
 * Use a conexão DIRETA do Supabase (porta 5432), nunca o pooler de transações:
 * DDL com múltiplos statements precisa de sessão estável.
 *
 * Quem não roda nada localmente não precisa deste script — a rota /api/setup
 * faz o mesmo a partir da aplicação já hospedada. Ver DEPLOY.md.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida. Preencha .env.local.');

  const { applied } = await runMigrations(url);
  for (const name of applied) console.log(`  aplicando ${name} … ok`);
  console.log(`\n${applied.length} migração(ões) aplicada(s).`);
}

main().catch((error) => {
  console.error('\nFalha na migração:', error instanceof Error ? error.message : error);
  process.exit(1);
});
