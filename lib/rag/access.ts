import { sql, type SQL } from 'drizzle-orm';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Regra única de visibilidade de documentos.
 *
 * Existe um só lugar que decide o que cada perfil enxerga — usado tanto pela
 * listagem quanto pela busca da IA. É isso que garante a promessa da tela de
 * ingestão: "a série e o segmento recortam o acesso dos alunos, inclusive no
 * que a IA busca". Um aluno não consegue extrair, via chat, um documento que
 * não poderia abrir na lista.
 *
 * @param alias tabela/alias sobre o qual as condições são aplicadas.
 */
export function documentVisibilityFilter(user: SessionUser, alias = 'd'): SQL {
  const t = sql.raw(alias);

  const conditions: SQL[] = [
    sql`${t}.tenant_id = ${user.tenantId}`,
    sql`${t}.status = 'ready'`,
    // Vigência: documento vencido deixa de ser fonte, sem precisar ser apagado.
    sql`(${t}.valid_until IS NULL OR ${t}.valid_until >= CURRENT_DATE)`,
    sql`(${t}.valid_from IS NULL OR ${t}.valid_from <= CURRENT_DATE)`,
  ];

  // Coordenação e administração enxergam o acervo inteiro do tenant.
  if (user.role === 'admin' || user.role === 'coordenacao') {
    return sql.join(conditions, sql` AND `);
  }

  // Público-alvo: lista vazia significa "toda a escola".
  conditions.push(
    sql`(cardinality(${t}.audience) = 0 OR ${user.role}::user_role = ANY(${t}.audience))`,
  );

  if (user.role === 'aluno') {
    // Alunos e responsáveis são recortados por série e segmento.
    const series = [user.serie, ...user.extraSeries].filter(Boolean) as string[];
    const seriesArray = sql`ARRAY[${sql.join(
      series.map((s) => sql`${s}`),
      sql`, `,
    )}]::text[]`;

    conditions.push(
      series.length > 0
        ? sql`(cardinality(${t}.series) = 0 OR ${t}.series && ${seriesArray})`
        : sql`cardinality(${t}.series) = 0`,
    );

    conditions.push(
      user.segment
        ? sql`(cardinality(${t}.segments) = 0 OR ${user.segment}::segment = ANY(${t}.segments))`
        : sql`cardinality(${t}.segments) = 0`,
    );
  }

  // Professores veem todas as séries: precisam preparar aula e responder
  // sobre turmas que não são a sua.

  return sql.join(conditions, sql` AND `);
}
