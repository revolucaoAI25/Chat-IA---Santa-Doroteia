import './env';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Empacota os arquivos .sql de drizzle/ num módulo TypeScript.
 *
 * Motivo: a rota /api/setup aplica as migrações a partir da aplicação
 * hospedada, para quem não roda nada localmente. Uma função serverless não tem
 * o diretório drizzle/ no disco — só o que o bundler incluiu. Ler o SQL de um
 * módulo importado é a forma que funciona em qualquer runtime, sem depender de
 * configuração de tracing de arquivos.
 *
 * O arquivo gerado é versionado. `npm run db:migrate` regenera antes de
 * aplicar, então o bundle não fica para trás em desenvolvimento; a rota de
 * setup usa o que estiver commitado.
 */
const OUT = 'lib/db/migrations.generated.ts';

async function main() {
  const dir = join(process.cwd(), 'drizzle');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const entries = await Promise.all(
    files.map(async (name) => ({ name, sql: await readFile(join(dir, name), 'utf8') })),
  );

  const body = entries
    .map(
      ({ name, sql }) =>
        `  {\n    name: ${JSON.stringify(name)},\n    sql: ${JSON.stringify(sql)},\n  },`,
    )
    .join('\n');

  const contents = `// GERADO POR scripts/bundle-migrations.ts — NÃO EDITE À MÃO.
// Regenere com: npm run db:migrate  (ou npx tsx scripts/bundle-migrations.ts)
//
// A fonte da verdade são os arquivos em drizzle/*.sql.

export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
${body}
];
`;

  await writeFile(join(process.cwd(), OUT), contents, 'utf8');
  console.log(`  ${files.length} migração(ões) empacotada(s) em ${OUT}`);
}

main().catch((error) => {
  console.error('Falha ao empacotar migrações:', error);
  process.exit(1);
});
