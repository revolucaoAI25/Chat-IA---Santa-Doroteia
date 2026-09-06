import Papa from 'papaparse';
import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  pageCount: number;
  /** Verdadeiro quando o texto veio de visão/OCR em vez da camada de texto nativa. */
  usedOcr: boolean;
}

/**
 * Abaixo disto por página o PDF é tratado como digitalizado: a camada de texto
 * existe mas está vazia ou é só ruído de scanner, e vale a pena pagar o OCR.
 */
const MIN_CHARS_PER_PAGE = 120;

export function isSupported(mimeType: string, fileName: string): boolean {
  return detectKind(mimeType, fileName) !== null;
}

type Kind = 'pdf' | 'docx' | 'csv' | 'xlsx' | 'text' | 'image';

function detectKind(mimeType: string, fileName: string): Kind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) return 'docx';
  if (ext === 'csv' || mimeType === 'text/csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xlsm' || mimeType.includes('spreadsheetml')) return 'xlsx';
  if (['txt', 'md', 'markdown', 'json'].includes(ext) || mimeType.startsWith('text/')) {
    return 'text';
  }
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return 'image';
  }
  return null;
}

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractionResult> {
  const kind = detectKind(mimeType, fileName);
  if (!kind) {
    throw new Error(`Formato não suportado: ${fileName} (${mimeType || 'sem mime type'})`);
  }

  switch (kind) {
    case 'pdf':
      return extractPdf(buffer, fileName);
    case 'docx':
      return extractDocx(buffer);
    case 'csv':
      return extractCsv(buffer);
    case 'xlsx':
      return extractXlsx(buffer);
    case 'text':
      return single(buffer.toString('utf8'));
    case 'image':
      return extractImage(buffer, mimeType, fileName);
  }
}

function single(text: string, usedOcr = false): ExtractionResult {
  return { pages: [{ page: 1, text: normalize(text) }], pageCount: 1, usedOcr };
}

/** Junta hifenização de fim de linha e colapsa espaços, preservando parágrafos. */
function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/([a-záéíóúâêôãõç])-\n([a-záéíóúâêôãõç])/gi, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  PDF                                                                        */
/* -------------------------------------------------------------------------- */

async function extractPdf(buffer: Buffer, fileName: string): Promise<ExtractionResult> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  // Cópia para um Uint8Array próprio: o pdf.js assume o buffer e o deixa
  // destacado, o que quebraria o fallback de OCR abaixo.
  const proxy = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(proxy, { mergePages: false });

  const pages: ExtractedPage[] = (text as string[]).map((t, i) => ({
    page: i + 1,
    text: normalize(t ?? ''),
  }));

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
  const looksScanned = totalPages > 0 && totalChars / totalPages < MIN_CHARS_PER_PAGE;

  if (looksScanned && !DEMO_MODE) {
    try {
      const ocr = await ocrPdfWithVision(buffer, fileName);
      if (ocr.trim().length > totalChars) {
        return { pages: [{ page: 1, text: normalize(ocr) }], pageCount: totalPages, usedOcr: true };
      }
    } catch (error) {
      // OCR é um reforço, não um requisito: seguimos com o texto nativo e o
      // documento fica marcado com o aviso no detalhe de status.
      console.warn(`OCR falhou para ${fileName}:`, error);
    }
  }

  return { pages, pageCount: totalPages, usedOcr: false };
}

/**
 * Manda o PDF inteiro para o modelo multimodal. Evita rasterizar páginas no
 * servidor (que exigiria canvas/pdfium, inviável em runtime serverless) e
 * cobre tanto digitalizações quanto PDFs com texto em imagem.
 */
async function ocrPdfWithVision(buffer: Buffer, fileName: string): Promise<string> {
  const response = await openai().responses.create({
    model: AI_MODELS.vision,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: fileName,
            file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
          },
          {
            type: 'input_text',
            text:
              'Transcreva integralmente o conteúdo deste documento escolar em texto puro, ' +
              'preservando a ordem de leitura, títulos, datas e tabelas (tabelas como linhas ' +
              'separadas por " | "). Não resuma, não comente e não invente nada. Se uma parte ' +
              'estiver ilegível, escreva [ilegível].',
          },
        ],
      },
    ],
  });

  return response.output_text ?? '';
}

/* -------------------------------------------------------------------------- */
/*  Demais formatos                                                            */
/* -------------------------------------------------------------------------- */

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = (await import('mammoth')).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return single(value);
}

async function extractCsv(buffer: Buffer): Promise<ExtractionResult> {
  const parsed = Papa.parse<string[]>(buffer.toString('utf8').trim(), {
    skipEmptyLines: true,
  });
  const rows = parsed.data as string[][];
  if (rows.length === 0) return single('');

  // Repetir o cabeçalho em cada linha faz cada trecho recuperado ser
  // interpretável isoladamente pelo modelo.
  const [header, ...body] = rows;
  const lines = body.map((row) =>
    row.map((cell, i) => `${header[i] ?? `col${i + 1}`}: ${cell}`).join(' | '),
  );
  return single([header.join(' | '), ...lines].join('\n'));
}

async function extractXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const pages: ExtractedPage[] = [];
  workbook.eachSheet((sheet, id) => {
    const lines: string[] = [`# Planilha: ${sheet.name}`];
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => cellToText(v));
      if (values.some((v) => v !== '')) lines.push(values.join(' | '));
    });
    pages.push({ page: id, text: normalize(lines.join('\n')) });
  });

  return { pages: pages.length ? pages : [{ page: 1, text: '' }], pageCount: pages.length || 1, usedOcr: false };
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (typeof v.text === 'string') return v.text;
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(value);
}

async function extractImage(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractionResult> {
  if (DEMO_MODE) {
    return single(`[Imagem ${fileName} — OCR indisponível sem OPENAI_API_KEY]`, false);
  }

  const response = await openai().responses.create({
    model: AI_MODELS.vision,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: `data:${mimeType || 'image/png'};base64,${buffer.toString('base64')}`,
            detail: 'high',
          },
          {
            type: 'input_text',
            text:
              'Transcreva todo o texto visível nesta imagem de documento escolar, ' +
              'preservando a ordem de leitura e as datas. Não resuma nem invente.',
          },
        ],
      },
    ],
  });

  return single(response.output_text ?? '', true);
}
