'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  documentChunks,
  documentType,
  documents,
  segment as segmentEnum,
  userRole,
  type DocumentTypeValue,
  type Role,
  type Segment,
} from '@/lib/db/schema';
import { isAdmin, requireSession } from '@/lib/auth/session';
import { documentTypeLabel, SERIES } from '@/lib/taxonomy';
import { contextHeader } from '@/lib/ingest/pipeline';
import { embedTexts } from '@/lib/ai/embeddings';
import { deleteObject } from '@/lib/storage';

/**
 * Correção de um documento já ingerido.
 *
 * A classificação automática acerta a maior parte, mas "a maior parte" não é
 * suficiente para um acervo oficial: um comunicado com a data errada ou com o
 * público-alvo trocado precisa ser consertado sem reenviar o arquivo — que,
 * aliás, o pipeline recusaria por duplicidade de checksum. Esta tela é o que
 * torna a dedução automática aceitável: ela pode errar porque erro tem conserto.
 */

const SERIE_VALUES = new Set(SERIES.map((s) => s.value));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DocumentState {
  error?: string;
  saved?: string;
}

/** Data opcional: string vazia é uma escolha ("sem data"), não campo ausente. */
function optionalDate(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  return DATE.test(raw) ? raw : null;
}

export async function updateDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const actor = await requireSession();
  if (!isAdmin(actor)) return { error: 'Apenas a administração pode editar documentos.' };

  const id = String(formData.get('documentId') ?? '');
  if (!id) return { error: 'Documento não informado.' };

  // Relido com o tenant conferido: um id de outra escola não é editável daqui.
  const current = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.tenantId, actor.tenantId)),
  });
  if (!current) return { error: 'Documento não encontrado.' };

  const title = String(formData.get('title') ?? '').trim();
  if (title.length < 2) return { error: 'O título não pode ficar vazio.' };

  const rawNumber = String(formData.get('docNumber') ?? '').trim();
  const docNumber = rawNumber ? Number(rawNumber) : null;
  if (rawNumber && (!Number.isInteger(docNumber) || docNumber! < 0)) {
    return { error: 'O número do comunicado precisa ser um inteiro.' };
  }

  const type = String(formData.get('type') ?? '');
  if (!(documentType.enumValues as readonly string[]).includes(type)) {
    return { error: 'Tipo inválido.' };
  }

  const rawAno = String(formData.get('anoLetivo') ?? '').trim();
  const anoLetivo = rawAno ? Number(rawAno) : null;
  if (rawAno && (!Number.isInteger(anoLetivo) || anoLetivo! < 2000 || anoLetivo! > 2100)) {
    return { error: 'Ano letivo inválido.' };
  }

  const validFrom = optionalDate(formData.get('validFrom'));
  const validUntil = optionalDate(formData.get('validUntil'));
  if (validFrom && validUntil && validFrom > validUntil) {
    return { error: 'A publicação não pode começar depois do fim da vigência.' };
  }

  const segments = formData
    .getAll('segments')
    .map(String)
    .filter((s): s is Segment => (segmentEnum.enumValues as readonly string[]).includes(s));

  const series = formData
    .getAll('series')
    .map(String)
    .filter((s) => SERIE_VALUES.has(s));

  const audience = formData
    .getAll('audience')
    .map(String)
    .filter((r): r is Role => (userRole.enumValues as readonly string[]).includes(r));

  // Mesma regra da ingestão: sem escopo escolhido não há o que restringir.
  const restrictToScope =
    formData.get('restrictToScope') === 'true' && (segments.length > 0 || series.length > 0);

  const patch = {
    title,
    docNumber,
    type: type as DocumentTypeValue,
    summary: String(formData.get('summary') ?? '').trim() || null,
    anoLetivo,
    etapa: String(formData.get('etapa') ?? '').trim().slice(0, 40) || null,
    documentDate: optionalDate(formData.get('documentDate')),
    validFrom,
    validUntil,
    segments,
    series,
    audience,
    restrictToScope,
    updatedAt: new Date(),
  };

  await db.update(documents).set(patch).where(eq(documents.id, id));

  await refreshChunkHeaders({ ...current, ...patch });

  revalidatePath('/admin');
  revalidatePath('/documentos');
  return { saved: id };
}

/**
 * Reescreve o cabeçalho de contexto dos trechos depois de uma correção.
 *
 * O cabeçalho ("[Comunicado · nº 254 · … · de 2026-10-01]") é prefixado ao
 * texto ANTES de virar vetor, então corrigir o título ou a data no banco sem
 * refazer isso deixaria a busca procurando pelo dado errado. São poucos trechos
 * por documento e um lote de embeddings custa frações de centavo.
 *
 * Falhar aqui não desfaz a correção: os metadados já estão salvos e é o que a
 * tela e o controle de acesso usam. O custo de uma falha é a busca ficar
 * levemente desatualizada até a próxima edição — bem menor que perder a edição.
 */
async function refreshChunkHeaders(doc: {
  id: string;
  title: string;
  type: DocumentTypeValue;
  docNumber: number | null;
  anoLetivo: number | null;
  documentDate: string | null;
  series: string[];
}): Promise<void> {
  try {
    const header = contextHeader({
      title: doc.title,
      type: documentTypeLabel(doc.type),
      docNumber: doc.docNumber,
      anoLetivo: doc.anoLetivo,
      documentDate: doc.documentDate,
      series: doc.series,
    });

    const chunks = await db
      .select({ id: documentChunks.id, content: documentChunks.content })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, doc.id));

    if (chunks.length === 0) return;

    const vectors = await embedTexts(chunks.map((c) => `${header}\n\n${c.content}`));

    await Promise.all(
      chunks.map((chunk, i) =>
        db
          .update(documentChunks)
          .set({ contextHeader: header, embedding: vectors[i] })
          .where(eq(documentChunks.id, chunk.id)),
      ),
    );
  } catch (error) {
    console.warn('Metadados salvos, mas os embeddings não foram refeitos:', error);
  }
}

/**
 * Apaga o documento e tudo que veio dele.
 *
 * Trechos e eventos saem por cascata no banco; o arquivo original sai do
 * storage em seguida. Exclusão de verdade, e não um "arquivado": um documento
 * que a secretaria mandou apagar não pode continuar respondendo no chat, e
 * manter o texto indexado seria exatamente isso.
 */
export async function deleteDocument(id: string): Promise<void> {
  const actor = await requireSession();
  if (!isAdmin(actor)) throw new Error('Apenas a administração pode excluir documentos.');

  const current = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.tenantId, actor.tenantId)),
    columns: { id: true, storagePath: true },
  });
  if (!current) throw new Error('Documento não encontrado.');

  await db.delete(documents).where(eq(documents.id, current.id));
  if (current.storagePath) await deleteObject(current.storagePath);

  revalidatePath('/admin');
  revalidatePath('/documentos');
}
