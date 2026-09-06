import OpenAI from 'openai';

/**
 * Camada fina sobre o provedor de IA. Todo o resto do sistema fala com estas
 * três funções — trocar de provedor (Gemini, Claude, um modelo self-hosted)
 * significa reimplementar este arquivo, e mais nada.
 */

export const AI_MODELS = {
  /** Responde no chat. Precisa ser bom em seguir instrução e barato por token. */
  chat: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1-mini',
  /** Classificação e extração de datas — saída estruturada, temperatura zero. */
  extraction: process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-4.1-mini',
  /** OCR de documentos digitalizados e imagens, via entrada multimodal. */
  vision: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
  /** 1536 dimensões, alinhado com a coluna vector do schema. */
  embedding: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
} as const;

export const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!hasOpenAI) {
    throw new Error(
      'OPENAI_API_KEY não configurada. Adicione a chave em .env.local para habilitar a IA real.',
    );
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/**
 * Modo de demonstração: sem chave, o sistema continua utilizável (a busca cai
 * para embeddings determinísticos locais e as respostas viram extrativas), o que
 * permite navegar pelas telas antes de ligar o provedor.
 */
export const DEMO_MODE = !hasOpenAI;
