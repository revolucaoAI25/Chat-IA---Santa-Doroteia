import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  documentChunks,
  documentEvents,
  documents,
  ingestionJobs,
  type DocumentTypeValue,
  type Role,
  type Segment,
} from '@/lib/db/schema';
import { embedTexts } from '@/lib/ai/embeddings';
import { putObject } from '@/lib/storage';
import { documentTypeLabel, serieLabel } from '@/lib/taxonomy';
import { chunkPages } from './chunk';
import { EVENT_AUTO_APPROVE_THRESHOLD, analyzeDocument } from './classify';
import { extractDocument } from './extract';

/** Vigência padrão quando nem o documento nem o administrador definem uma. */
const DEFAULT_RETENTION_MONTHS = Number(process.env.DEFAULT_RETENTION_MONTHS ?? 12);

/**
 * Correções que o administrador impõe sobre a classificação automática.
 *
 * A IA acerta a maior parte, mas quem responde pela escola é a coordenação:
 * qualquer campo preenchido aqui vence o que o modelo deduziu. Campo ausente
 * (`undefined`) mantém a sugestão da IA; lista vazia é uma escolha explícita
 * de "vale para toda a escola".
 */
export interface ClassificationOverrides {
  type?: DocumentTypeValue;
  anoLetivo?: number | null;
  etapa?: string | null;
  segments?: Segment[];
  series?: string[];
  validUntil?: string | null;
}

export interface IngestOptions {
  tenantId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  /** Vazio = toda a escola. Definido pelo administrador na tela de ingestão. */
  audience: Role[];
  overrides?: ClassificationOverrides;
}

export interface IngestResult {
  documentId: string;
  title: string;
  type: string;
  segments: Segment[];
  series: string[];
  anoLetivo: number | null;
  validUntil: string | null;
  chunkCount: number;
  eventCount: number;
  eventsNeedingReview: number;
  usedOcr: boolean;
  duplicate: boolean;
}

type Step = { step: string; at: string; detail?: string };

/**
 * Ciclo completo de um documento: extrair -> classificar -> fatiar -> embutir
 * -> gravar. Cada passo é registrado em `ingestion_jobs` para a tela de
 * ingestão mostrar o progresso e para auditoria posterior.
 */
export async function ingestDocument(options: IngestOptions): Promise<IngestResult> {
  const { tenantId, userId, fileName, mimeType, buffer } = options;
  const steps: Step[] = [];

  const [job] = await db
    .insert(ingestionJobs)
    .values({ tenantId, fileName, status: 'pending', startedBy: userId })
    .returning();

  const track = async (step: string, status: typeof documents.$inferInsert.status, detail?: string) => {
    steps.push({ step, at: new Date().toISOString(), detail });
    await db.update(ingestionJobs).set({ steps, status }).where(eq(ingestionJobs.id, job.id));
  };

  try {
    // 1. Deduplicação por conteúdo: reenviar o mesmo arquivo não duplica o acervo.
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = await db.query.documents.findFirst({
      where: and(eq(documents.tenantId, tenantId), eq(documents.checksum, checksum)),
    });

    if (existing) {
      await db
        .update(ingestionJobs)
        .set({
          status: 'ready',
          documentId: existing.id,
          finishedAt: new Date(),
          steps: [...steps, { step: 'duplicado', at: new Date().toISOString() }],
        })
        .where(eq(ingestionJobs.id, job.id));

      return {
        documentId: existing.id,
        title: existing.title,
        type: existing.type,
        segments: existing.segments,
        series: existing.series,
        anoLetivo: existing.anoLetivo,
        validUntil: existing.validUntil,
        chunkCount: 0,
        eventCount: 0,
        eventsNeedingReview: 0,
        usedOcr: existing.usedOcr,
        duplicate: true,
      };
    }

    // 2. Texto (com OCR quando o arquivo for digitalizado).
    await track('extraindo texto', 'extracting');
    const extraction = await extractDocument(buffer, mimeType, fileName);
    const fullText = extraction.pages.map((p) => p.text).join('\n\n');

    if (fullText.trim().length < 20) {
      throw new Error(
        'Não foi possível ler texto deste arquivo. Se for um documento digitalizado, verifique se a OPENAI_API_KEY está configurada para habilitar o OCR.',
      );
    }

    // 3. Classificação e extração de datas, na mesma chamada.
    await track('classificando', 'classifying', `${extraction.pageCount} página(s)`);
    const analysis = await analyzeDocument({
      fileName,
      text: fullText,
      referenceDate: new Date().toISOString().slice(0, 10),
    });

    // A escolha do administrador vence a dedução da IA, campo a campo.
    const overrides = options.overrides ?? {};
    const validUntil =
      overrides.validUntil !== undefined && overrides.validUntil !== null
        ? overrides.validUntil
        : (analysis.validUntil ?? defaultValidUntil());

    const finalType = overrides.type ?? analysis.type;
    const finalSegments = overrides.segments ?? analysis.segments;
    const finalSeries = overrides.series ?? analysis.series;
    const finalAnoLetivo =
      overrides.anoLetivo !== undefined ? overrides.anoLetivo : analysis.anoLetivo;
    const finalEtapa = overrides.etapa !== undefined ? overrides.etapa : analysis.etapa;

    // 4. Arquivo original preservado para o "baixe o PDF" das citações.
    const storagePath = `${tenantId}/${checksum.slice(0, 2)}/${checksum}-${safeName(fileName)}`;
    await putObject(storagePath, buffer, mimeType);

    const [document] = await db
      .insert(documents)
      .values({
        tenantId,
        title: analysis.title || fileName,
        docNumber: analysis.docNumber,
        type: finalType,
        summary: analysis.summary,
        segments: finalSegments,
        series: finalSeries,
        etapa: finalEtapa,
        anoLetivo: finalAnoLetivo,
        validFrom: analysis.validFrom,
        validUntil,
        audience: options.audience,
        sourceKind: 'upload',
        sourceRef: fileName,
        storagePath,
        mimeType,
        byteSize: buffer.byteLength,
        checksum,
        pageCount: extraction.pageCount,
        usedOcr: extraction.usedOcr,
        status: 'embedding',
        uploadedBy: userId,
      })
      .returning();

    await db
      .update(ingestionJobs)
      .set({ documentId: document.id })
      .where(eq(ingestionJobs.id, job.id));

    // 5. Fatiar e embutir. Cada trecho leva um cabeçalho com a identidade do
    //    documento, para continuar interpretável fora do contexto original.
    await track('gerando embeddings', 'embedding');
    const chunks = chunkPages(extraction.pages);
    const header = contextHeader({
      title: document.title,
      type: documentTypeLabel(document.type),
      docNumber: document.docNumber,
      anoLetivo: document.anoLetivo,
      series: document.series,
    });

    if (chunks.length > 0) {
      const vectors = await embedTexts(chunks.map((c) => `${header}\n\n${c.content}`));

      // Lotes de 200: mantém cada INSERT abaixo do limite de parâmetros do Postgres.
      for (let i = 0; i < chunks.length; i += 200) {
        const slice = chunks.slice(i, i + 200);
        await db.insert(documentChunks).values(
          slice.map((chunk, j) => ({
            documentId: document.id,
            tenantId,
            ordinal: chunk.ordinal,
            page: chunk.page,
            content: chunk.content,
            contextHeader: header,
            tokenCount: chunk.tokenCount,
            embedding: vectors[i + j],
          })),
        );
      }
    }

    // 6. Eventos extraídos. Confiança baixa entra na fila de revisão humana.
    let needingReview = 0;
    if (analysis.events.length > 0) {
      await db.insert(documentEvents).values(
        analysis.events.map((event) => {
          const review =
            event.confidence >= EVENT_AUTO_APPROVE_THRESHOLD ? ('ativo' as const) : ('a_revisar' as const);
          if (review === 'a_revisar') needingReview++;
          return {
            tenantId,
            documentId: document.id,
            title: event.title,
            type: event.type,
            startsOn: event.startsOn,
            endsOn: event.endsOn,
            startsAtTime: event.startsAtTime,
            subject: event.subject,
            chamada: event.chamada,
            // Sem série própria, o evento herda o alcance do documento.
            segments: document.segments,
            series: event.series.length > 0 ? event.series : document.series,
            review,
            confidence: event.confidence.toFixed(2),
            sourceExcerpt: event.sourceExcerpt.slice(0, 500),
          };
        }),
      );
    }

    await db
      .update(documents)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    await track('concluído', 'ready', `${chunks.length} trechos, ${analysis.events.length} evento(s)`);
    await db
      .update(ingestionJobs)
      .set({ finishedAt: new Date() })
      .where(eq(ingestionJobs.id, job.id));

    return {
      documentId: document.id,
      title: document.title,
      type: document.type,
      segments: document.segments,
      series: document.series,
      anoLetivo: document.anoLetivo,
      validUntil: document.validUntil,
      chunkCount: chunks.length,
      eventCount: analysis.events.length,
      eventsNeedingReview: needingReview,
      usedOcr: extraction.usedOcr,
      duplicate: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(ingestionJobs)
      .set({ status: 'failed', error: message, finishedAt: new Date(), steps })
      .where(eq(ingestionJobs.id, job.id));
    throw error;
  }
}

function defaultValidUntil(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + DEFAULT_RETENTION_MONTHS);
  return date.toISOString().slice(0, 10);
}

function safeName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
}

export function contextHeader(doc: {
  title: string;
  type: string;
  docNumber: number | null;
  anoLetivo: number | null;
  series: string[];
}): string {
  const parts = [doc.type];
  if (doc.docNumber) parts.push(`nº ${doc.docNumber}`);
  parts.push(doc.title);
  if (doc.anoLetivo) parts.push(`ano letivo ${doc.anoLetivo}`);
  if (doc.series.length > 0) parts.push(doc.series.map(serieLabel).join(', '));
  return `[${parts.join(' · ')}]`;
}
