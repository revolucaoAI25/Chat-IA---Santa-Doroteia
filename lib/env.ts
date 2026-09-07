/**
 * Leitura de variáveis de ambiente que trata **vazio como ausente**.
 *
 * O motivo é concreto. Em painéis como o da Vercel, criar a variável e deixar o
 * campo em branco é o gesto mais natural do mundo para quem está seguindo uma
 * lista de nomes — e `process.env.X ?? padrão` não protege contra isso: `??` só
 * cai no padrão quando o valor é `null` ou `undefined`, nunca quando é `''`.
 *
 * O estrago é silencioso e desproporcional:
 *
 * - `OPENAI_EXTRACTION_MODEL` em branco vira `model: ''` na chamada, e a OpenAI
 *   responde `400 — you must provide a model parameter`. Toda ingestão falha.
 * - `Number('')` é **zero**, não `NaN`. Então `DEFAULT_RETENTION_MONTHS` em
 *   branco faz todo documento nascer vencido, e `CHAT_RATE_MAX_QUESTIONS` em
 *   branco impede qualquer pergunta. Nenhum dos dois dá erro — só param de
 *   funcionar.
 *
 * Daí este módulo ser a única forma de ler configuração opcional no projeto.
 * As variáveis obrigatórias (DATABASE_URL, SESSION_SECRET) continuam sendo
 * lidas onde são usadas, porque ali faltar precisa mesmo estourar.
 */

/** Texto, ou o padrão quando a variável está ausente, vazia ou só com espaços. */
export function envText(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/**
 * Número **maior que zero**, ou o padrão.
 *
 * Exigir positivo, e não apenas finito, é deliberado: todas as variáveis
 * numéricas do projeto são durações e limites, onde zero nunca é uma escolha
 * legítima — é sempre o resultado de `Number('')`. Um `CHAT_RATE_MAX_QUESTIONS`
 * zerado trancaria o chat da escola inteira sem nenhuma mensagem de erro.
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Verdadeiro/falso explícito, ou `undefined` quando não foi definido. */
export function envFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

/** Segredo: devolve `undefined` quando vazio, para `Boolean()` não mentir. */
export function envSecret(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
