import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSIONS } from '@/lib/db/schema';
import { AI_MODELS, DEMO_MODE, openai } from './provider';

/** A API aceita lotes grandes; 96 mantém cada requisição bem abaixo do limite de tokens. */
const BATCH_SIZE = 96;

/**
 * Embedding determinístico local, usado só quando não há chave de API.
 * É um "hashing trick" sobre bigramas de palavras: não tem semântica de
 * verdade, mas casa termos literais — o suficiente para demonstrar o fluxo de
 * busca sem custo. Nunca é usado quando OPENAI_API_KEY está presente.
 */
function localEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const grams: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]}_${words[i + 1]}`);

  for (const gram of grams) {
    const digest = createHash('sha1').update(gram).digest();
    const slot = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[slot] += sign;
  }

  let sumSquares = 0;
  for (const v of vector) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map((v) => v / norm);
}

/** Gera embeddings preservando a ordem da entrada. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (DEMO_MODE) return texts.map(localEmbedding);

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai().embeddings.create({
      model: AI_MODELS.embedding,
      input: batch.map((t) => t.replace(/\s+/g, ' ').slice(0, 8000)),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    // A API não garante ordem, mas devolve o índice de cada item.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    out.push(...ordered.map((d) => d.embedding));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
