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

  /*
   * Público-alvo: sempre restringe.
   *
   * Diferente da série, aqui a escolha é humana e deliberada — o administrador
   * marcou "só corpo docente" na tela de upload. Lista vazia significa "toda a
   * escola", que também é uma escolha.
   */
  conditions.push(
    sql`(cardinality(${t}.audience) = 0 OR ${user.role}::user_role = ANY(${t}.audience))`,
  );

  /*
   * Série e segmento: só restringem quando a administração marcou
   * `restrict_to_scope` no upload.
   *
   * A classificação automática sozinha NÃO esconde documento. Ela erra para os
   * dois lados, e o erro caro é o de esconder: um comunicado geral que menciona
   * o 7º ano de passagem sumiria para o resto da escola, e ninguém descobriria
   * — a pessoa só receberia "não encontrei". Quando a restrição de fato importa
   * (a prova de uma série específica), o administrador marca, e aí vale.
   *
   * Professores continuam vendo todas as séries mesmo com a marca: precisam
   * preparar aula e responder sobre turmas que não são a sua.
   */
  if (user.role === 'aluno') {
    const series = [user.serie, ...user.extraSeries].filter(Boolean) as string[];
    const seriesArray = sql`ARRAY[${sql.join(
      series.map((s) => sql`${s}`),
      sql`, `,
    )}]::text[]`;

    const serieOk =
      series.length > 0
        ? sql`(cardinality(${t}.series) = 0 OR ${t}.series && ${seriesArray})`
        : sql`cardinality(${t}.series) = 0`;

    const segmentoOk = user.segment
      ? sql`(cardinality(${t}.segments) = 0 OR ${user.segment}::segment = ANY(${t}.segments))`
      : sql`cardinality(${t}.segments) = 0`;

    conditions.push(sql`(${t}.restrict_to_scope = false OR (${serieOk} AND ${segmentoOk}))`);
  }

  return sql.join(conditions, sql` AND `);
}
