import './env';
import { sql } from 'drizzle-orm';
import { db, sqlClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { documentVisibilityFilter } from '@/lib/rag/access';
import { retrieve } from '@/lib/rag/retrieve';
import { upcomingEvents } from '@/lib/rag/events';

/**
 * Verificação de fumaça do que não pode quebrar: o recorte de acesso por
 * perfil, o corte por vigência e a busca híbrida. Roda contra o banco semeado.
 *
 *   npm run db:seed && npx tsx scripts/verify.ts
 */

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? '  ok  ' : ' FALHA';
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

async function visibleTitles(user: SessionUser): Promise<string[]> {
  const rows = await db.execute<{ title: string }>(sql`
    SELECT d.title FROM documents d WHERE ${documentVisibilityFilter(user, 'd')} ORDER BY d.title
  `);
  return [...rows].map((r) => r.title);
}

async function main() {
  const rows = await db.select().from(users);
  const asSession = (matricula: string): SessionUser => {
    const u = rows.find((r) => r.matricula === matricula);
    if (!u) throw new Error(`Usuário ${matricula} não encontrado. Rode npm run db:seed.`);
    return {
      id: u.id,
      tenantId: u.tenantId,
      name: u.name,
      email: u.email,
      matricula: u.matricula,
      role: u.role,
      segment: u.segment,
      serie: u.serie,
      turma: u.turma,
      extraSeries: u.extraSeries,
      disciplinas: u.disciplinas,
      segmentsTaught: u.segmentsTaught,
      contextNote: u.contextNote,
    };
  };

  const aluno7 = asSession('2026074'); // 7º ano, Fundamental II
  const alunoEM = asSession('2026112'); // 2ª série, Ensino Médio
  const professor = asSession('P1042');
  const admin = asSession('ADM001');

  console.log('\nCONTROLE DE ACESSO\n');

  const doAluno7 = await visibleTitles(aluno7);
  const doAlunoEM = await visibleTitles(alunoEM);
  const doProfessor = await visibleTitles(professor);
  const doAdmin = await visibleTitles(admin);

  const restrito = 'Orientações Pedagógicas para o Corpo Docente — 3ª Etapa';
  check('aluno NÃO vê o documento restrito ao corpo docente', !doAluno7.includes(restrito));
  check('professor VÊ o documento restrito ao corpo docente', doProfessor.includes(restrito));
  check('admin VÊ o documento restrito ao corpo docente', doAdmin.includes(restrito));

  const vencido = 'Calendário de Provas — 1ª Etapa/2025 (encerrado)';
  check('documento vencido fica fora para o aluno', !doAluno7.includes(vencido));
  check('documento vencido fica fora até para o admin', !doAdmin.includes(vencido));

  const conteudo7 = 'Conteúdos da Avaliação A3 — 7º ano';
  check('aluno do 7º ano vê o conteúdo do 7º ano', doAluno7.includes(conteudo7));
  check('aluno do Ensino Médio NÃO vê o conteúdo do 7º ano', !doAlunoEM.includes(conteudo7));

  const simulado = 'Simulado ENEM 2026 — Ensino Médio';
  check('aluno do Ensino Médio vê o Simulado ENEM', doAlunoEM.includes(simulado));
  check('aluno do 7º ano NÃO vê o Simulado ENEM', !doAluno7.includes(simulado));

  const festa = 'Festa Junina Solidária 2026 — Programação e Convite';
  check('documento sem recorte chega a todo mundo', doAluno7.includes(festa) && doAlunoEM.includes(festa));

  console.log(
    `\n  visíveis: aluno 7º=${doAluno7.length}  aluno EM=${doAlunoEM.length}  professor=${doProfessor.length}  admin=${doAdmin.length}`,
  );

  console.log('\nBUSCA HÍBRIDA\n');

  const provaMat = await retrieve(aluno7, 'quando é a prova de matemática?');
  check(
    'pergunta sobre prova de matemática recupera o cronograma',
    provaMat.some((c) => c.title.includes('Cronograma de Avaliações')),
    provaMat[0]?.title ?? 'nada encontrado',
  );

  const porNumero = await retrieve(aluno7, 'comunicado 226');
  check(
    'busca por número de comunicado encontra o documento certo',
    porNumero.some((c) => c.docNumber === 226),
    porNumero[0]?.title ?? 'nada encontrado',
  );

  const vazamento = await retrieve(aluno7, 'prazo para lançamento de notas conselho de classe');
  check(
    'a busca do aluno nunca devolve trecho do documento restrito',
    vazamento.every((c) => !c.title.includes('Corpo Docente')),
    `${vazamento.length} trecho(s)`,
  );

  console.log('\nAGENDA ESTRUTURADA\n');

  const agenda7 = await upcomingEvents(aluno7);
  const agendaEM = await upcomingEvents(alunoEM);
  const agendaProf = await upcomingEvents(professor);

  check(
    'aluno do 7º ano recebe eventos na agenda',
    agenda7.length > 0,
    `${agenda7.length} evento(s)`,
  );
  check(
    'a agenda vem ordenada por data',
    agenda7.every((e, i) => i === 0 || agenda7[i - 1].startsOn <= e.startsOn),
  );
  check(
    'a agenda não traz nada que já passou',
    agenda7.every((e) => (e.endsOn ?? e.startsOn) >= new Date().toISOString().slice(0, 10)),
  );
  check(
    'só entram eventos já validados (review = ativo)',
    agenda7.every((e) => e.review === 'ativo'),
  );
  check(
    'aluno do Ensino Médio não recebe prova do 7º ano',
    !agendaEM.some((e) => e.series.includes('7_ano_fund2')),
  );
  check(
    'aluno do 7º ano não recebe o Simulado ENEM',
    !agenda7.some((e) => e.title.includes('Simulado ENEM')),
  );
  check(
    'aluno não recebe prazos internos do corpo docente',
    !agenda7.some((e) => e.documentTitle.includes('Corpo Docente')),
  );
  check(
    'professor recebe os prazos internos do corpo docente',
    agendaProf.some((e) => e.documentTitle.includes('Corpo Docente')),
  );

  console.log(
    `\n  agenda: aluno 7º=${agenda7.length}  aluno EM=${agendaEM.length}  professor=${agendaProf.length}`,
  );
  if (agenda7[0]) {
    console.log(`  próximo do 7º ano: ${agenda7[0].startsOn} — ${agenda7[0].title}`);
  }

  console.log(
    failures === 0
      ? '\nTodas as verificações passaram.\n'
      : `\n${failures} verificação(ões) falharam.\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Erro na verificação:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end();
  });
