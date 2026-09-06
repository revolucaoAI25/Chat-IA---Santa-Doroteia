import './env';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

/**
 * Aplica os arquivos .sql de ./drizzle em ordem alfabética.
 *
 * As migrações são escritas à mão (e não geradas pelo drizzle-kit) porque a
 * ordem importa: a extensão `vector` precisa existir antes da coluna vector, e
 * a coluna gerada `content_tsv` não é expressável no schema do Drizzle.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida. Preencha .env.local.');

  // Migração usa conexão direta (porta 5432), nunca o pooler de transações:
  // DDL com múltiplos statements precisa de sessão estável.
  // `onnotice` silencia os "already exists, skipping" esperados numa
  // migração idempotente — erros de verdade continuam sendo lançados.
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const dir = join(process.cwd(), 'drizzle');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      process.stdout.write(`  aplicando ${file} … `);
      const contents = await readFile(join(dir, file), 'utf8');
      await sql.unsafe(contents);
      console.log('ok');
    }

    console.log(`\n${files.length} migração(ões) aplicada(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('\nFalha na migração:', error instanceof Error ? error.message : error);
  process.exit(1);
});
