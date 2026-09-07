import postgres from 'postgres';
import { MIGRATIONS } from './migrations.generated';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Aplica as migrações empacotadas.
 *
 * Compartilhado entre o script de linha de comando e a rota /api/setup, para
 * que os dois caminhos apliquem exatamente o mesmo SQL.
 *
 * As migrações são idempotentes por construção (`IF NOT EXISTS`, blocos
 * `DO $$ ... EXCEPTION`), então reaplicar todas é seguro — e é o que mantém
 * este código simples, sem tabela de controle de versão.
 *
 * A conexão é aberta e fechada aqui, e não reaproveita o pool da aplicação:
 * DDL com vários statements precisa de sessão estável e não funciona no pooler
 * de transações.
 */
export async function runMigrations(connectionString: string): Promise<MigrationResult> {
  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    // Silencia os "already exists, skipping" esperados numa migração
    // idempotente; erro de verdade continua sendo lançado.
    onnotice: () => {},
    connect_timeout: 30,
  });

  const applied: string[] = [];

  try {
    for (const migration of MIGRATIONS) {
      await sql.unsafe(migration.sql);
      applied.push(migration.name);
    }
  } finally {
    await sql.end();
  }

  return { applied, skipped: [] };
}
