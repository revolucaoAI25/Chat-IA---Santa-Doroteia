import './env';
import { createHash } from 'node:crypto';
import { db, sqlClient } from '@/lib/db';
import {
  conversations,
  documentChunks,
  documentEvents,
  documents,
  ingestionJobs,
  messages,
  tenants,
  users,
} from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { embedTexts } from '@/lib/ai/embeddings';
import { chunkPages } from '@/lib/ingest/chunk';
import { contextHeader } from '@/lib/ingest/pipeline';
import { documentTypeLabel } from '@/lib/taxonomy';
import { DEMO_MODE } from '@/lib/ai/provider';
import { currentAnoLetivo } from '@/lib/academic-calendar';
import { SEED_DOCUMENTS } from './seed-data';

/**
 * Popula o banco com o tenant, os usuários de teste e o acervo de demonstração.
 *
 * Os metadados dos documentos são curados (e não gerados pelo classificador)
 * para que a demonstração seja determinística. O caminho de fatiamento e
 * embedding, porém, é exatamente o de produção — o que a ingestão real faz a
 * mais é a classificação automática, exercitada ao subir um arquivo pela tela
 * de Administração.
 */
async function main() {
  console.log('Semeando o banco…\n');

  // Reexecutável: limpa o que este script cria, preservando a ordem das FKs.
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(ingestionJobs);
  await db.delete(documentEvents);
  await db.delete(documentChunks);
  await db.delete(documents);
  await db.delete(users);
  await db.delete(tenants);

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: 'santa-doroteia-bh',
      displayName: 'Colégio Santa Dorotéia Belo Horizonte - MG',
      branding: { primary: '#0F3B85', logoSize: 176 },
    })
    .returning();

  const password = process.env.SEED_PASSWORD ?? 'santadoroteia';
  const passwordHash = await hashPassword(password);

  const seedUsers = [
    {
      matricula: '2026074',
      email: 'helena.martins@aluno.santadoroteia.com.br',
      name: 'Helena Martins',
      role: 'aluno' as const,
      segment: 'fundamental_ii' as const,
      serie: '7_ano_fund2',
      serieAnoLetivo: currentAnoLetivo(),
      turma: '7A',
    },
    {
      matricula: '2026112',
      email: 'lucas.ferreira@aluno.santadoroteia.com.br',
      name: 'Lucas Ferreira',
      role: 'aluno' as const,
      segment: 'ensino_medio' as const,
      serie: '2_serie_em',
      serieAnoLetivo: currentAnoLetivo(),
      turma: '2B',
    },
    {
      matricula: 'P1042',
      email: 'ricardo.almeida@santadoroteia.com.br',
      name: 'Ricardo Almeida',
      role: 'professor' as const,
      segment: 'fundamental_ii' as const,
      serie: null,
      serieAnoLetivo: null,
      turma: null,
      // Contexto definido pela secretaria, na aba Usuários.
      disciplinas: ['Matemática', 'Física'],
      seriesTaught: ['7_ano_fund2', '8_ano_fund2', '9_ano_fund2'],
      segmentsTaught: ['fundamental_ii' as const],
    },
    {
      matricula: 'ADM001',
      email: 'wesley@santadoroteia.com.br',
      name: 'Wesley',
      role: 'admin' as const,
      segment: null,
      serie: null,
      serieAnoLetivo: null,
      turma: null,
    },
  ];

  const insertedUsers = await db
    .insert(users)
    .values(seedUsers.map((u) => ({ ...u, tenantId: tenant.id, passwordHash })))
    .returning();

  const admin = insertedUsers.find((u) => u.role === 'admin')!;
  console.log(`  ${insertedUsers.length} usuários criados.`);

  let totalChunks = 0;
  let totalEvents = 0;

  for (const seed of SEED_DOCUMENTS) {
    const checksum = createHash('sha256').update(seed.text).digest('hex');

    const [document] = await db
      .insert(documents)
      .values({
        tenantId: tenant.id,
        title: seed.title,
        docNumber: seed.docNumber,
        type: seed.type,
        summary: seed.summary,
        segments: seed.segments,
        series: seed.series,
        restrictToScope: seed.restrictToScope ?? false,
        etapa: seed.etapa,
        anoLetivo: seed.anoLetivo,
        validFrom: seed.validFrom,
        validUntil: seed.validUntil,
        audience: seed.audience,
        sourceKind: 'seed',
        sourceRef: `${seed.title}.txt`,
        mimeType: 'text/plain',
        byteSize: Buffer.byteLength(seed.text),
        checksum,
        pageCount: 1,
        status: 'ready',
        uploadedBy: admin.id,
      })
      .returning();

    const chunks = chunkPages([{ page: 1, text: seed.text }]);
    const header = contextHeader({
      title: document.title,
      type: documentTypeLabel(document.type),
      docNumber: document.docNumber,
      anoLetivo: document.anoLetivo,
      series: document.series,
    });

    const vectors = await embedTexts(chunks.map((c) => `${header}\n\n${c.content}`));

    await db.insert(documentChunks).values(
      chunks.map((chunk, i) => ({
        documentId: document.id,
        tenantId: tenant.id,
        ordinal: chunk.ordinal,
        page: chunk.page,
        content: chunk.content,
        contextHeader: header,
        tokenCount: chunk.tokenCount,
        embedding: vectors[i],
      })),
    );

    if (seed.events.length > 0) {
      await db.insert(documentEvents).values(
        seed.events.map((event) => ({
          tenantId: tenant.id,
          documentId: document.id,
          title: event.title,
          type: event.type,
          startsOn: event.startsOn,
          endsOn: event.endsOn ?? null,
          startsAtTime: event.startsAtTime ?? null,
          subject: event.subject ?? null,
          chamada: event.chamada ?? null,
          segments: seed.segments,
          series: seed.series,
          review: event.confidence >= 0.75 ? ('ativo' as const) : ('a_revisar' as const),
          confidence: event.confidence.toFixed(2),
          sourceExcerpt: event.sourceExcerpt,
        })),
      );
    }

    totalChunks += chunks.length;
    totalEvents += seed.events.length;
    console.log(`  ✓ ${seed.title} — ${chunks.length} trecho(s), ${seed.events.length} evento(s)`);
  }

  console.log(
    `\n${SEED_DOCUMENTS.length} documentos, ${totalChunks} trechos e ${totalEvents} eventos.`,
  );
  if (DEMO_MODE) {
    console.log(
      '\nAVISO: sem OPENAI_API_KEY. Os embeddings gravados são os determinísticos locais.\n' +
        'Ao configurar a chave, rode `npm run db:seed` de novo para reindexar com embeddings reais.',
    );
  }

  console.log('\nEntre com qualquer uma destas matrículas:');
  for (const user of seedUsers) {
    console.log(`  ${user.matricula.padEnd(9)} ${user.role.padEnd(10)} ${user.name}`);
  }
  console.log(`  senha para todos: ${password}`);
}

main()
  .catch((error) => {
    console.error('\nFalha no seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient().end();
  });
