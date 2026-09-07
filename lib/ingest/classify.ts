import { z } from 'zod';
import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';
import { DOCUMENT_TYPES, SEGMENTS, SERIES } from '@/lib/taxonomy';
import type { DocumentTypeValue, Segment } from '@/lib/db/schema';

const SERIE_VALUES = SERIES.map((s) => s.value);
const EVENT_TYPES = ['prova', 'recuperacao', 'simulado', 'evento', 'entrega'] as const;

/** Abaixo disto o evento entra na fila de validação humana em vez de ir direto ao calendário. */
export const EVENT_AUTO_APPROVE_THRESHOLD = 0.75;

const eventSchema = z.object({
  title: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startsAtTime: z.string().nullable(),
  subject: z.string().nullable(),
  chamada: z.number().int().min(1).max(2).nullable(),
  series: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string(),
});

const analysisSchema = z.object({
  title: z.string().min(1),
  docNumber: z.number().int().nullable(),
  type: z.enum(DOCUMENT_TYPES as [DocumentTypeValue, ...DocumentTypeValue[]]),
  summary: z.string(),
  segments: z.array(z.enum(SEGMENTS as [Segment, ...Segment[]])),
  series: z.array(z.string()),
  etapa: z.string().nullable(),
  anoLetivo: z.number().int().nullable(),
  /** Data impressa no cabeçalho/assinatura. Data o documento; nunca vira evento. */
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  events: z.array(eventSchema),
});

export type DocumentAnalysis = z.infer<typeof analysisSchema>;

/** JSON Schema estrito: no modo strict a OpenAI exige todo campo em `required`. */
const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'docNumber', 'type', 'summary', 'segments', 'series',
    'etapa', 'anoLetivo', 'documentDate', 'validUntil', 'events',
  ],
  properties: {
    title: { type: 'string' },
    docNumber: { type: ['integer', 'null'] },
    type: { type: 'string', enum: DOCUMENT_TYPES },
    summary: { type: 'string' },
    segments: { type: 'array', items: { type: 'string', enum: SEGMENTS } },
    series: { type: 'array', items: { type: 'string', enum: SERIE_VALUES } },
    etapa: { type: ['string', 'null'] },
    anoLetivo: { type: ['integer', 'null'] },
    documentDate: { type: ['string', 'null'] },
    validUntil: { type: ['string', 'null'] },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title', 'type', 'startsOn', 'endsOn', 'startsAtTime',
          'subject', 'chamada', 'series', 'confidence', 'sourceExcerpt',
        ],
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: EVENT_TYPES },
          startsOn: { type: 'string' },
          endsOn: { type: ['string', 'null'] },
          startsAtTime: { type: ['string', 'null'] },
          subject: { type: ['string', 'null'] },
          chamada: { type: ['integer', 'null'] },
          series: { type: 'array', items: { type: 'string', enum: SERIE_VALUES } },
          confidence: { type: 'number' },
          sourceExcerpt: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é o analista documental do Colégio Santa Dorotéia. Recebe o texto integral de um documento oficial e devolve seus metadados e as datas relevantes.

REGRAS DE CLASSIFICAÇÃO
- "title": o título real do documento, limpo, sem o número do comunicado e sem a extensão do arquivo.
- "docNumber": só quando o documento traz um número explícito (ex.: "Com. 112" -> 112). Caso contrário, null.
- "type": escolha o mais específico que couber.
- "segments" e "series": SOMENTE o que o documento indicar explicitamente. Se ele vale para toda a escola, devolva listas vazias — lista vazia significa "todo mundo vê", e é melhor do que um palpite errado que esconderia o documento de quem precisa.
- "summary": 1 a 2 frases dizendo a que o documento serve, em português, sem repetir o título.
- "validUntil": até quando a informação ainda vale, ou seja, a partir de quando o documento vira histórico. Um cronograma da 1ª etapa deixa de valer quando a etapa acaba. Sem base para concluir, null.
- "documentDate": a data DO DOCUMENTO — a que aparece no cabeçalho, na linha de local e data ou junto da assinatura ("Belo Horizonte, 08 de outubro de 2026" -> "2026-10-08"). É quando o documento foi escrito, e é o que permite dizer qual comunicado é mais recente quando dois se contradizem. Não confunda com as datas do corpo: um comunicado emitido em outubro que anuncia a formatura de dezembro tem documentDate "2026-10-08", nunca "2026-12-11". Se o documento não trouxer data própria, null.

REGRAS DE EXTRAÇÃO DE DATAS (o ponto mais importante)
- Extraia apenas datas de COISAS QUE VÃO ACONTECER: provas, recuperações, simulados, entregas, eventos, reuniões, prazos.
- NUNCA extraia a data de emissão/assinatura do documento — essa vai em "documentDate" e **não** pode virar evento. Também não extraia datas citadas como referência histórica ou de contexto ("como informado em 12/03").
- Uma linha de cronograma com várias matérias vira VÁRIOS eventos, um por matéria/data.
- "startsOn"/"endsOn" sempre em YYYY-MM-DD. Um intervalo ("de 08/06 a 17/06") preenche os dois; uma data única deixa "endsOn" null.
- Se o ano não estiver escrito, use o ano letivo do documento; se nem esse existir, use o ano da data de referência informada no contexto.
- "startsAtTime" em HH:MM quando houver horário; senão null.
- "chamada": 1 ou 2 quando o texto falar de 1ª ou 2ª chamada; senão null.
- "confidence": quão certo você está de que essa é mesmo uma data de evento futuro e de que leu o dia certo. Use abaixo de 0.75 quando o ano for inferido, quando a data estiver ambígua ou quando a linha estiver truncada.
- "sourceExcerpt": o trecho LITERAL do documento de onde a data saiu, no máximo 200 caracteres. É o que permite a conferência humana.
- Nenhuma data relevante? Devolva "events": [].

Não invente nada. Se a informação não está no texto, o valor é null ou lista vazia.`;

export interface ClassifyInput {
  fileName: string;
  text: string;
  /** Data de hoje (YYYY-MM-DD) para resolver referências relativas. */
  referenceDate: string;
}

export async function analyzeDocument(input: ClassifyInput): Promise<DocumentAnalysis> {
  if (DEMO_MODE) return heuristicAnalysis(input);

  // O começo carrega título/número/série e o fim costuma trazer o cronograma;
  // documentos muito longos são cortados no meio, não na cauda.
  const text = clampForContext(input.text, 60_000);

  const response = await openai().chat.completions.create({
    model: AI_MODELS.extraction,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Arquivo: ${input.fileName}\nData de referência (hoje): ${input.referenceDate}\n\n--- TEXTO DO DOCUMENTO ---\n${text}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'document_analysis', strict: true, schema: jsonSchema },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('A análise do documento voltou vazia.');

  const parsed = analysisSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Análise em formato inesperado: ${parsed.error.message}`);
  }

  return sanitize(parsed.data, input.referenceDate);
}

function clampForContext(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return `${text.slice(0, head)}\n\n[...trecho central omitido por tamanho...]\n\n${text.slice(-tail)}`;
}

/** Descarta eventos que o modelo devolveu mal formados, em vez de gravar lixo. */
function sanitize(analysis: DocumentAnalysis, referenceDate: string): DocumentAnalysis {
  const events = analysis.events.filter((event) => {
    if (Number.isNaN(Date.parse(event.startsOn))) return false;
    if (event.endsOn && Number.isNaN(Date.parse(event.endsOn))) return false;
    if (event.endsOn && event.endsOn < event.startsOn) return false;
    // Datas absurdas quase sempre são ano inferido errado.
    const year = Number(event.startsOn.slice(0, 4));
    const refYear = Number(referenceDate.slice(0, 4));
    return year >= refYear - 2 && year <= refYear + 3;
  });

  return {
    ...analysis,
    series: analysis.series.filter((s) => SERIE_VALUES.includes(s)),
    events: events.map((e) => ({ ...e, series: e.series.filter((s) => SERIE_VALUES.includes(s)) })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Fallback sem chave de API                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sem OPENAI_API_KEY o sistema ainda classifica por regras e acha datas por
 * regex. Serve para navegar pelas telas; a qualidade real vem do modelo.
 */
function heuristicAnalysis(input: ClassifyInput): DocumentAnalysis {
  const text = input.text;
  const lower = text.toLowerCase();

  const typeGuesses: Array<[DocumentTypeValue, RegExp]> = [
    ['cronograma_provas', /cronograma|calend[áa]rio de prova/],
    ['conteudo_avaliacao', /conte[úu]do.{0,20}avalia[çc]/],
    ['recuperacao', /recupera[çc][ãa]o/],
    ['comunicado', /comunicado/],
    ['circular', /circular/],
    ['lista_material', /lista de material/],
    ['autorizacao', /autoriza[çc][ãa]o/],
    ['convite', /convite/],
  ];
  const type = typeGuesses.find(([, re]) => re.test(lower))?.[0] ?? 'outro';

  // Detecção por expressão ancorada, e não por substring: "fundamental ii"
  // contém "fundamental i", e casar os dois marcaria o documento para um
  // segmento que ele não menciona — o que recortaria o acesso errado.
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const segmentPatterns: Array<[Segment, RegExp]> = [
    ['educacao_infantil', /educacao\s+infantil/],
    ['fundamental_ii', /fundamental\s+(?:ii|2)\b|\b[6789]\s*[.º°o]?\s*ano\b/],
    ['fundamental_i', /fundamental\s+i\b(?!i)|fundamental\s+1\b|\b[12345]\s*[.º°o]?\s*ano\b/],
    ['ensino_medio', /ensino\s+medio|\b[123]\s*[.ªa]?\s*serie\b/],
  ];
  const segments = segmentPatterns.filter(([, re]) => re.test(normalized)).map(([s]) => s);

  const events: DocumentAnalysis['events'] = [];
  const dateRe = /(\d{2})\/(\d{2})\/(\d{4})/g;
  const seen = new Set<string>();
  for (const match of text.matchAll(dateRe)) {
    const [full, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${mm}-${dd}`;
    if (seen.has(iso)) continue;
    seen.add(iso);
    const at = match.index ?? 0;
    events.push({
      title: `Data encontrada em ${full}`,
      type: type === 'recuperacao' ? 'recuperacao' : type === 'cronograma_provas' ? 'prova' : 'evento',
      startsOn: iso,
      endsOn: null,
      startsAtTime: null,
      subject: null,
      chamada: null,
      series: [],
      // Baixa de propósito: tudo vindo de regex precisa de conferência humana.
      confidence: 0.3,
      sourceExcerpt: text.slice(Math.max(0, at - 80), at + 80).trim(),
    });
    if (events.length >= 20) break;
  }

  const numberMatch = text.match(/(?:com\.?|comunicado|circular)\s*n?[.º°]?\s*(\d{1,4})/i);
  const yearMatch = text.match(/\b(20\d{2})\b/);

  return {
    title: input.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
    docNumber: numberMatch ? Number(numberMatch[1]) : null,
    type,
    summary: text.slice(0, 240).replace(/\s+/g, ' ').trim(),
    segments,
    series: [],
    etapa: null,
    anoLetivo: yearMatch ? Number(yearMatch[1]) : null,
    documentDate: null,
    validUntil: null,
    events,
  };
}
