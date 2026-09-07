import './env';
import { sql } from 'drizzle-orm';
import { db, sqlClient } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { documentVisibilityFilter } from '@/lib/rag/access';
import { listVisibleDocuments } from '@/lib/documents';
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
      seriesTaught: u.seriesTaught,
      segmentsTaught: u.segmentsTaught,
      concluido: false,
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

  /*
   * A regra de visibilidade e a listagem da tela de Documentos deixaram de ser
   * a mesma coisa para o administrador, e a diferença é deliberada: a busca da
   * IA continua sem enxergar o vencido (a checagem acima), mas a tela mostra —
   * senão o documento com a data lida errada do cabeçalho, que venceu antes da
   * hora, ficaria inalcançável para conserto. As duas checagens juntas são o
   * que impede que uma delas seja "corrigida" para o lado errado.
   */
  const listaAdmin = await listVisibleDocuments(admin);
  const listaAluno = await listVisibleDocuments(aluno7);
  const naListaDoAdmin = listaAdmin.find((d) => d.title === vencido);
  check('a tela de Documentos mostra o vencido ao administrador', Boolean(naListaDoAdmin));
  check('e o mostra marcado como fora de vigência', naListaDoAdmin?.hidden === true);
  check(
    'o vencido continua fora da lista do aluno',
    !listaAluno.some((d) => d.title === vencido),
  );
  check(
    'nenhum documento vem marcado como fora de vigência para o aluno',
    listaAluno.every((d) => !d.hidden),
  );

  /*
   * O `valid_from` no futuro esconde o documento de todo mundo. É um recurso
   * legítimo, e foi um acidente caro: o classificador lia "Formatura em
   * 11/12/2026" e devolvia essa data como início de vigência, o que sumia com o
   * comunicado durante os meses em que ele mais importa. O pipeline agora
   * descarta data futura vinda do modelo — aqui confirmamos que a coluna,
   * quando de fato preenchida, continua escondendo, e que o acervo semeado não
   * tem nenhum documento invisível por esse motivo.
   */
  const [futuro] = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM documents WHERE valid_from > CURRENT_DATE
  `);
  check(
    'nenhum documento do acervo está invisível por vigência futura',
    futuro.total === 0,
    `${futuro.total} documento(s) com valid_from no futuro`,
  );

  const [semData] = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM documents WHERE document_date IS NULL
  `);
  check(
    'a data do documento é uma coluna própria, separada dos eventos',
    typeof semData.total === 'number',
    `${semData.total} documento(s) ainda sem data de emissão registrada`,
  );

  /*
   * A contagem de trechos e eventos por documento é o número que o
   * administrador usa para decidir se a ingestão funcionou. Ela já esteve
   * errada — zerada para todos — por subconsulta com coluna não qualificada, e
   * o efeito foi pior que o bug: fazia a ingestão parecer quebrada quando
   * estava certa.
   */
  const contagens = await db.execute<{ title: string; trechos: number; eventos: number }>(sql`
    SELECT d.title,
           (SELECT count(*) FROM document_chunks c WHERE c.document_id = d.id)::int AS trechos,
           (SELECT count(*) FROM document_events e WHERE e.document_id = d.id)::int AS eventos
    FROM documents d
  `);
  const listadas = [...contagens];
  check(
    'todo documento do acervo tem pelo menos um trecho indexado',
    listadas.length > 0 && listadas.every((d) => d.trechos > 0),
    `${listadas.filter((d) => d.trechos === 0).length} documento(s) sem trecho`,
  );
  check(
    'a contagem de eventos por documento não vem zerada para todos',
    listadas.some((d) => d.eventos > 0),
  );

  // Classificado como 7º ano, mas SEM restrição explícita: continua visível
  // para toda a escola. Classificar não é esconder.
  const conteudo7 = 'Conteúdos da Avaliação A3 — 7º ano';
  check('aluno do 7º ano vê o conteúdo do 7º ano', doAluno7.includes(conteudo7));
  check(
    'classificação de série NÃO esconde: aluno do EM também vê o conteúdo do 7º ano',
    doAlunoEM.includes(conteudo7),
  );

  // Único com `restrictToScope`: aqui a marca da administração tem de valer.
  const simulado = 'Simulado ENEM 2026 — Ensino Médio';
  check('aluno do Ensino Médio vê o Simulado ENEM', doAlunoEM.includes(simulado));
  check(
    'restrição explícita vale: aluno do 7º ano NÃO vê o Simulado ENEM',
    !doAluno7.includes(simulado),
  );
  check(
    'restrição explícita não atinge o professor',
    doProfessor.includes(simulado),
  );

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

  // Ninguém digita acento no celular. Antes da migração 0004 a metade lexical
  // era sensível a acento e devolvia zero justamente aqui.
  const semAcento = await retrieve(aluno7, 'recuperacao final matematica');
  check(
    'pergunta digitada sem acento encontra o documento acentuado',
    semAcento.some((c) => c.title.includes('Recuperação')),
    semAcento[0]?.title ?? 'nada encontrado',
  );

  // O planejador alonga a pergunta para resolver o follow-up. A busca precisa
  // sobreviver a isso: com AND puro entre sete radicais, o retorno seria zero.
  const consultaLonga = await retrieve(
    aluno7,
    'data e horario da prova de matematica do 7 ano na terceira etapa de 2026',
  );
  check(
    'consulta longa (reescrita pelo planejador) ainda recupera',
    consultaLonga.some((c) => c.title.includes('Cronograma de Avaliações')),
    `${consultaLonga.length} trecho(s), 1º = ${consultaLonga[0]?.title ?? '—'}`,
  );

  // A classificação não esconde mais nada, então ela precisa aparecer na
  // ORDENAÇÃO: o documento do 7º ano vem antes para quem é do 7º ano.
  const consulta = 'conteudos da avaliacao';
  const posicao = async (u: SessionUser) =>
    (await retrieve(u, consulta)).findIndex((c) => c.title.includes('A3 — 7º ano'));
  const [pos7, posEM] = [await posicao(aluno7), await posicao(alunoEM)];
  check(
    'documento da série de quem pergunta vem antes',
    pos7 >= 0 && (posEM < 0 || pos7 <= posEM),
    `7º ano: posição ${pos7 + 1} · Ensino Médio: posição ${posEM + 1}`,
  );

  // Pergunta de panorama tem de varrer mais que uma pergunta pontual.
  const foco = await retrieve(aluno7, 'quando e a prova de matematica', { breadth: 'foco' });
  const amplo = await retrieve(aluno7, 'quando e a prova de matematica', { breadth: 'amplo' });
  check(
    'amplitude "amplo" recupera pelo menos tanto quanto "foco"',
    amplo.length >= foco.length,
    `foco ${foco.length} trecho(s) · amplo ${amplo.length} trecho(s)`,
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
    await sqlClient().end();
  });
