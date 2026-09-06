import { NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth/session';
import { ingestDocument, type ClassificationOverrides } from '@/lib/ingest/pipeline';
import { isSupported } from '@/lib/ingest/extract';
import {
  documentType,
  segment as segmentEnum,
  userRole,
  type DocumentTypeValue,
  type Role,
  type Segment,
} from '@/lib/db/schema';
import { SERIES } from '@/lib/taxonomy';

const SERIE_VALUES = new Set(SERIES.map((s) => s.value));

export const runtime = 'nodejs';
// OCR e classificação de um PDF longo passam bem de 60s.
export const maxDuration = 300;

const MAX_BYTES = 32 * 1024 * 1024;

/**
 * Ingestão de um documento. Um arquivo por requisição, de propósito: a tela
 * envia vários em paralelo e acompanha cada um com o seu próprio estado, em vez
 * de esperar um lote inteiro terminar para mostrar qualquer coisa.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json(
      { error: 'Apenas a administração pode ingerir documentos.' },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Arquivo acima do limite de ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (!isSupported(file.type, file.name)) {
    return NextResponse.json(
      { error: 'Formato não suportado. Envie PDF, DOCX, CSV, XLSX, TXT ou imagem.' },
      { status: 415 },
    );
  }

  // Público-alvo: valores fora do enum são descartados em vez de aceitos.
  const audience = form
    .getAll('audience')
    .map(String)
    .filter((value): value is Role => (userRole.enumValues as readonly string[]).includes(value));

  // Campos ausentes ficam `undefined` de propósito: é o que sinaliza ao
  // pipeline "mantenha o que a IA deduziu". Lista vazia enviada pelo formulário
  // é diferente — significa "toda a escola", uma escolha explícita.
  const overrides: ClassificationOverrides = {};

  const validUntil = form.get('validUntil');
  if (typeof validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    overrides.validUntil = validUntil;
  }

  const type = String(form.get('type') ?? '');
  if ((documentType.enumValues as readonly string[]).includes(type)) {
    overrides.type = type as DocumentTypeValue;
  }

  const anoLetivo = Number(form.get('anoLetivo'));
  if (Number.isInteger(anoLetivo) && anoLetivo >= 2000 && anoLetivo <= 2100) {
    overrides.anoLetivo = anoLetivo;
  }

  const etapa = String(form.get('etapa') ?? '').trim();
  if (etapa) overrides.etapa = etapa.slice(0, 40);

  if (form.get('overrideScope') === 'true') {
    overrides.segments = form
      .getAll('segments')
      .map(String)
      .filter((s): s is Segment => (segmentEnum.enumValues as readonly string[]).includes(s));
    overrides.series = form
      .getAll('series')
      .map(String)
      .filter((s) => SERIE_VALUES.has(s));
  }

  try {
    const result = await ingestDocument({
      tenantId: user.tenantId,
      userId: user.id,
      fileName: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      audience,
      overrides,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Falha na ingestão:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao ingerir o documento.' },
      { status: 500 },
    );
  }
}
