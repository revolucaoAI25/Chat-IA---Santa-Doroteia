import OpenAI from 'openai';
import { envSecret, envText } from '@/lib/env';

/**
 * Camada fina sobre o provedor de IA. Todo o resto do sistema fala com estas
 * três funções — trocar de provedor (Gemini, Claude, um modelo self-hosted)
 * significa reimplementar este arquivo, e mais nada.
 */

/**
 * Um modelo por tarefa, e não o mesmo para tudo.
 *
 * A assimetria que manda aqui: a **ingestão roda uma vez por documento**
 * (centenas de vezes no total), enquanto o **chat roda dezenas de milhares de
 * vezes por mês**. Então vale pagar um modelo mais forte na extração — o erro
 * ali vira dado errado no banco, que contamina toda resposta futura — e
 * economizar no chat, onde o trabalho pesado (achar o trecho certo) já foi
 * feito pela busca.
 */
export const AI_MODELS = {
  /**
   * Responde no chat. Escolhido por seguir instrução com rigor ("use apenas as
   * fontes"), que importa mais aqui do que capacidade de raciocínio.
   */
  chat: envText('OPENAI_CHAT_MODEL', 'gpt-4.1-mini'),

  /**
   * Reescreve a pergunta e decide sobre esclarecimento. Tarefa pequena e
   * estruturada; roda a cada pergunta, então é o lugar do modelo mais barato.
   */
  planner: envText('OPENAI_PLANNER_MODEL', 'gpt-4.1-mini'),

  /**
   * Classificação e extração de datas. Modelo maior de propósito: uma data
   * lida errado na ingestão vira um evento errado no calendário e uma resposta
   * errada para sempre. Como roda uma vez por documento, o custo é marginal.
   */
  extraction: envText('OPENAI_EXTRACTION_MODEL', 'gpt-4.1'),

  /** OCR de documentos digitalizados e imagens, via entrada multimodal. */
  vision: envText('OPENAI_VISION_MODEL', 'gpt-4.1-mini'),

  /** 1536 dimensões, alinhado com a coluna vector do schema. */
  embedding: envText('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
} as const;

export const hasOpenAI = envSecret('OPENAI_API_KEY') !== undefined;

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!hasOpenAI) {
    throw new Error(
      'OPENAI_API_KEY não configurada. Adicione a chave em .env.local para habilitar a IA real.',
    );
  }
  client ??= new OpenAI({ apiKey: envSecret('OPENAI_API_KEY') });
  return client;
}

/**
 * Modo de demonstração: sem chave, o sistema continua utilizável (a busca cai
 * para embeddings determinísticos locais e as respostas viram extrativas), o que
 * permite navegar pelas telas antes de ligar o provedor.
 */
export const DEMO_MODE = !hasOpenAI;
