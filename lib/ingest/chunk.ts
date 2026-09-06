import type { ExtractedPage } from './extract';

export interface Chunk {
  ordinal: number;
  page: number | null;
  content: string;
  tokenCount: number;
}

/**
 * ~3.000 caracteres ≈ 750 tokens em português. Grande o bastante para carregar
 * uma tabela de provas inteira, pequeno o bastante para não diluir o embedding.
 */
const TARGET_CHARS = 3000;
const OVERLAP_CHARS = 350;
const MIN_CHARS = 80;

/** Estimativa suficiente para telemetria de custo; não precisa do tokenizador real. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Fatia por página, quebrando em parágrafos e depois em frases. A sobreposição
 * evita que uma data caia exatamente na fronteira entre dois trechos e acabe
 * sem contexto suficiente para ser recuperada.
 */
export function chunkPages(pages: ExtractedPage[]): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const page of pages) {
    for (const piece of splitText(page.text)) {
      chunks.push({
        ordinal: ordinal++,
        page: page.page,
        content: piece,
        tokenCount: estimateTokens(piece),
      });
    }
  }

  return chunks;
}

function splitText(text: string): string[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  if (clean.length <= TARGET_CHARS) return [clean];

  const units = clean.split(/\n{2,}/).flatMap(splitLongParagraph);

  const out: string[] = [];
  let current = '';

  for (const unit of units) {
    if (current && current.length + unit.length + 2 > TARGET_CHARS) {
      out.push(current.trim());
      current = tail(current, OVERLAP_CHARS) + '\n\n' + unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }

  if (current.trim().length >= MIN_CHARS) {
    out.push(current.trim());
  } else if (current.trim() && out.length > 0) {
    // Resto curto demais para valer um trecho próprio: gruda no anterior.
    out[out.length - 1] = `${out[out.length - 1]}\n\n${current.trim()}`;
  } else if (current.trim()) {
    out.push(current.trim());
  }

  return out;
}

/** Um parágrafo maior que o alvo é quebrado por frases, nunca no meio da palavra. */
function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= TARGET_CHARS) return [paragraph];

  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const out: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > TARGET_CHARS) {
      out.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Últimos `size` caracteres, recuados até o começo de uma palavra. */
function tail(text: string, size: number): string {
  if (text.length <= size) return text;
  const slice = text.slice(-size);
  const boundary = slice.search(/\s/);
  return boundary === -1 ? slice : slice.slice(boundary + 1);
}
