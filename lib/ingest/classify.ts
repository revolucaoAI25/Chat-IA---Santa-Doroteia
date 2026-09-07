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
  startsOn: z.string(),
  endsOn: z.string().nullable(),
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
  /*
   * As datas entram como texto livre e são normalizadas depois, em `sanitize`.
   *
   * Exigir YYYY-MM-DD aqui parecia mais seguro e não era: o modelo devolvendo
   * "OUT/2026" derrubava o `safeParse`, e com ele a ingestão inteira do
   * arquivo — o documento não entrava no acervo por causa de um campo de
   * metadado. Como os arquivos do colégio não têm formatação padronizada, esse
   * caso não é raro. Aqui aceitamos o que vier; `sanitize` converte o que dá
   * para converter e devolve null no resto, que a administração conserta pela
   * tela de edição.
   */
  documentDate: z.string().nullable(),
  validUntil: z.string().nullable(),
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
- "documentDate": a data DO DOCUMENTO — quando ele foi escrito. É o que permite dizer qual comunicado é mais recente quando dois se contradizem.
  Onde procurar, nesta ordem: linha de local e data no alto ou no pé ("Belo Horizonte, 08 de outubro de 2026"); junto da assinatura; no cabeçalho ou rodapé junto do número do comunicado; no nome do arquivo. Nem todo documento segue o mesmo padrão — procure a data que se refere ao próprio documento, esteja ela onde estiver.
  Aceite qualquer notação e normalize para YYYY-MM-DD: "08/10/2026", "8.10.26", "08-out-2026", "8 de outubro de 2026", "OUT/2026", "2026-10-08". Dia e mês em português seguem a ordem BRASILEIRA: "03/04/2026" é 3 de abril, nunca 4 de março. Ano com dois dígitos vira 20xx. Se só houver mês e ano, use o dia 01.
  NÃO confunda com as datas do corpo: um comunicado emitido em outubro que anuncia a formatura de dezembro tem documentDate "2026-10-08", nunca "2026-12-11". Também não é a data de uma reunião citada no texto, nem o prazo de entrega.
  Na dúvida entre duas datas candidatas, prefira a que estiver mais perto do cabeçalho ou da assinatura. Se nenhuma for claramente a data do documento, devolva **null** — a administração completa depois, e null é melhor que a data errada, que faria o sistema tratar um comunicado antigo como o mais recente.

REGRAS DE EXTRAÇÃO DE DATAS (o ponto mais importante)
- Extraia apenas datas de COISAS QUE VÃO ACONTECER: provas, recuperações, simulados, entregas, eventos, reuniões, prazos.
- NUNCA extraia a data de emissão/assinatura do documento — essa vai em "documentDate" e **não** pode virar evento. Também não extraia datas citadas como referência histórica ou de contexto ("como informado em 12/03").
- Uma linha de cronograma com várias matérias vira VÁRIOS eventos, um por matéria/data.
- "startsOn"/"endsOn" sempre em YYYY-MM-DD. Um intervalo ("de 08/06 a 17/06") preenche os dois; uma data única deixa "endsOn" null.
- Se o ano não estiver escrito, use o ano letivo do documento; se nem esse existir, use o ano da data de referência informada no contexto.
- Os documentos não têm formatação padronizada: a mesma escola escreve "12/11", "12 de novembro", "quinta-feira, 12/11/2026" e "12.11.26". Leia todas, e sempre na ordem brasileira (dia/mês).
- "startsAtTime" em HH:MM quando houver horário; senão null.
- "chamada": 1 ou 2 quando o texto falar de 1ª ou 2ª chamada; senão null.
- "confidence": quão certo você está de que essa é mesmo uma data de evento futuro e de que leu o dia certo. Use abaixo de 0.75 quando o ano for inferido, quando a data estiver ambígua ou quando a linha estiver truncada.
- "sourceExcerpt": o trecho LITERAL do documento de onde a data saiu, no máximo 200 caracteres. É o que permite a conferência humana.
- Nenhuma data relevante? Devolva "events": [].

SOBRE A FORMA DOS DOCUMENTOS
Nem todo arquivo é um comunicado bem diagramado. Pode chegar sem papel timbrado, sem número, com o título só no nome do arquivo, em tabela, em ata, em lista solta, ou vindo de OCR com quebras de linha estranhas e acentos perdidos. Extraia o que der para extrair com segurança e devolva null no resto — a administração corrige pela tela, e um campo em branco é fácil de notar e consertar, enquanto um palpite errado passa despercebido e vira resposta errada meses depois.

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

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Só existe em Postgres o que existe no calendário: 31/02 não é data. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function iso(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dois dígitos viram 20xx: o acervo do colégio não tem documento do século passado. */
function fullYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

/**
 * Converte para YYYY-MM-DD o que o modelo devolveu em qualquer notação.
 *
 * O prompt já pede a data normalizada, e na maior parte das vezes ela vem assim.
 * Isto é a rede embaixo: os arquivos do colégio não seguem um padrão — vêm de
 * OCR, de planilha, de ata, com "12.11.26", "12 de novembro de 2026" ou
 * "nov/2026" no cabeçalho — e o modelo às vezes repassa a forma original. Sem
 * a conversão aqui, essa data ou derrubava a ingestão ou chegava ao Postgres
 * como texto inválido.
 *
 * Ordem brasileira sempre: em "03/04/2026" o 3 é o dia. Não há como distinguir
 * do formato americano pelo valor, e adivinhar erraria silenciosamente meses
 * inteiros; a origem dos documentos é conhecida, então a regra é fixa.
 *
 * O que não couber em nenhuma forma volta null. Um campo vazio a administração
 * enxerga e corrige na tela de edição; uma data errada ninguém percebe.
 */
export function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;

  const text = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Escapado, e não com os acentos literais: marcas combinantes soltas no
    // código-fonte somem em qualquer normalização de arquivo e o regex passa a
    // não casar com nada, silenciosamente.
    .replace(/[\u0300-\u036f]/g, '');

  // 2026-10-08 (e 2026/10/08)
  const isoLike = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoLike) return iso(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));

  // 08/10/2026 · 8.10.26 · 08-10-2026
  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    return iso(fullYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
  }

  // 8 de outubro de 2026 · 08-out-2026 · 8 out 2026
  const withMonth = text.match(/^(\d{1,2})\s*(?:de\s+)?[-/ ]?\s*([a-z]{3,})\.?\s*(?:de\s+)?[-/ ]?\s*(\d{2,4})$/);
  if (withMonth) {
    const month = MESES[withMonth[2].slice(0, 3)];
    if (month) return iso(fullYear(Number(withMonth[3])), month, Number(withMonth[1]));
  }

  // out/2026 · outubro de 2026 — sem dia, assume o primeiro.
  const monthOnly = text.match(/^([a-z]{3,})\.?\s*(?:de\s+)?[-/ ]?\s*(\d{2,4})$/);
  if (monthOnly) {
    const month = MESES[monthOnly[1].slice(0, 3)];
    if (month) return iso(fullYear(Number(monthOnly[2])), month, 1);
  }

  // 2026-10 — ano e mês, mesma regra.
  const isoMonth = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoMonth) return iso(Number(isoMonth[1]), Number(isoMonth[2]), 1);

  /*
   * Último recurso: a data embutida numa frase.
   *
   * O modelo às vezes devolve a linha inteira do cabeçalho em vez do valor
   * ("Belo Horizonte, 08 de outubro de 2026", "quinta-feira, 12/11/2026") —
   * mais provável justamente nos arquivos sem diagramação, que são o caso que
   * este código existe para atender. A alternativa aqui é null, então extrair
   * a data que está claramente escrita ali é sempre melhor.
   */
  // O ISO vem primeiro, e o dia-primeiro exige fronteira de não-dígito dos dois
  // lados: sem isso, "Emitido em 2026-10-08" casava a partir do "26-10-08" e
  // devolvia 2008-10-26 — uma data plausível, nunca questionada, e errada.
  const embeddedIso = text.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (embeddedIso) {
    return iso(Number(embeddedIso[1]), Number(embeddedIso[2]), Number(embeddedIso[3]));
  }

  const embedded =
    text.match(/(?<!\d)(\d{1,2})\s+de\s+([a-z]{3,})\s+de\s+(\d{2,4})(?!\d)/) ??
    text.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/);
  if (embedded) {
    const mes = MESES[embedded[2].slice(0, 3)] ?? Number(embedded[2]);
    return iso(fullYear(Number(embedded[3])), mes, Number(embedded[1]));
  }

  return null;
}

/** Descarta eventos que o modelo devolveu mal formados, em vez de gravar lixo. */
function sanitize(analysis: DocumentAnalysis, referenceDate: string): DocumentAnalysis {
  const refYear = Number(referenceDate.slice(0, 4));

  const events = analysis.events
    .map((event) => ({
      ...event,
      startsOn: normalizeDate(event.startsOn),
      endsOn: normalizeDate(event.endsOn),
    }))
    .filter((event): event is typeof event & { startsOn: string } => {
      if (!event.startsOn) return false;
      if (event.endsOn && event.endsOn < event.startsOn) return false;
      // Datas absurdas quase sempre são ano inferido errado.
      const year = Number(event.startsOn.slice(0, 4));
      return year >= refYear - 2 && year <= refYear + 3;
    });

  return {
    ...analysis,
    documentDate: normalizeDate(analysis.documentDate),
    validUntil: normalizeDate(analysis.validUntil),
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
