import './env';
import { eq, sql } from 'drizzle-orm';
import { db, sqlClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { retrieve } from '@/lib/rag/retrieve';
import { effectiveSerie } from '@/lib/series-progression';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Sonda de qualidade da busca.
 *
 * Faz um conjunto de perguntas reais e mostra o que a busca híbrida devolveria
 * para cada perfil, com a posição de cada documento. Serve para responder à
 * única pergunta que importa antes de olhar a redação da resposta: **o trecho
 * certo chegou ao prompt?** Se não chegou, nenhum modelo salva a resposta.
 *
 * As perguntas são escritas sem acento de propósito — é como se digita no
 * celular, e era exatamente o caso que a busca lexical não atendia antes da
 * migração 0004.
 *
 * Uso: `npm run busca` (usa o DATABASE_URL do ambiente).
 */

const PERGUNTAS = [
  'quando e a prova de matematica do 7 ano na 3a etapa',
  'comunicado 240 recuperacao',
  'o que cai na avaliacao de matematica',
  'quais sao as regras de uniforme e controle de acesso',
  'data e horario da festa junina',
  'prazo de lancamento de notas do corpo docente',
];

/** Perfis a comparar. A mesma pergunta deve trazer coisas diferentes. */
const PERFIS = ['2026074', 'P1042'];

async function sessionFor(matricula: string): Promise<SessionUser | null> {
  const u = await db.query.users.findFirst({ where: eq(users.matricula, matricula) });
  if (!u) return null;

  const eff = effectiveSerie(u.serie, u.serieAnoLetivo);
  return {
    id: u.id,
    tenantId: u.tenantId,
    name: u.name,
    email: u.email,
    matricula: u.matricula,
    role: u.role,
    segment: eff.segment ?? u.segment,
    serie: eff.serie,
    turma: u.turma,
    extraSeries: u.extraSeries,
    disciplinas: u.disciplinas,
    seriesTaught: u.seriesTaught,
    segmentsTaught: u.segmentsTaught,
    concluido: eff.concluido,
  };
}

const [{ total }] = await db.execute<{ total: number }>(
  sql`SELECT count(*)::int AS total FROM document_chunks`,
);
console.log(`\nAcervo: ${total} trecho(s) indexado(s).`);

if (!process.env.OPENAI_API_KEY) {
  console.log(
    'AVISO: sem OPENAI_API_KEY. Os embeddings são os determinísticos locais, então a\n' +
      'metade vetorial da busca está degradada — o que passar aqui assim tende a\n' +
      'melhorar com a chave, não a piorar.',
  );
}

for (const matricula of PERFIS) {
  const user = await sessionFor(matricula);
  if (!user) {
    console.log(`\n(matrícula ${matricula} não existe neste banco — pulando)`);
    continue;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${user.name} — ${user.role}${user.serie ? ` · ${user.serie}` : ''}`);
  console.log('='.repeat(70));

  for (const pergunta of PERGUNTAS) {
    const hits = await retrieve(user, pergunta);
    const documentos = new Set(hits.map((h) => h.documentId));
    const caracteres = hits.reduce((n, h) => n + h.content.length, 0);

    console.log(`\n  "${pergunta}"`);
    if (hits.length === 0) {
      console.log('    nada encontrado');
      continue;
    }
    console.log(
      `    ${hits.length} trecho(s) · ${documentos.size} documento(s) · ${caracteres} caracteres`,
    );
    hits.slice(0, 3).forEach((h, i) => {
      console.log(`    ${i + 1}. ${h.title}${h.page ? ` (pág. ${h.page})` : ''}`);
    });
  }
}

console.log('');
await sqlClient().end();
