import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';
import type { SessionUser } from '@/lib/auth/session';
import { documentTypeLabel, segmentLabel, serieLabel } from '@/lib/taxonomy';
import type { DocumentTypeValue } from '@/lib/db/schema';
import type { RetrievedChunk } from './retrieve';

export interface Citation {
  documentId: string;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  excerpt: string;
}

/**
 * Descreve para o modelo com quem ele está falando.
 *
 * Não é enfeite: é o que muda o registro da resposta e o que a IA considera
 * relevante. O recorte de acesso já aconteceu na busca — aqui é só tom e foco.
 */
function audienceBriefing(user: SessionUser): string {
  switch (user.role) {
    case 'aluno':
      return [
        `Você está falando com ${user.name}, aluno(a) do ${serieLabel(user.serie)}` +
          `${user.turma ? `, turma ${user.turma}` : ''} (${segmentLabel(user.segment)}).`,
        'A pergunta pode vir do próprio aluno ou do responsável — trate os dois do mesmo jeito.',
        'Fale de forma direta e acolhedora, sem jargão administrativo.',
        `Priorize o que afeta o ${serieLabel(user.serie)}. Se um documento vale para várias séries, diga o que se aplica a essa.`,
        'Nunca comente notas, situação financeira ou dados de outros alunos.',
      ].join(' ');

    case 'professor':
      return [
        `Você está falando com ${user.name}, professor(a) do colégio.`,
        'Pode usar linguagem técnica e pedagógica, e citar normas e prazos internos.',
        'O professor enxerga todas as séries: quando a resposta variar por série ou segmento, ' +
          'organize por série em vez de escolher uma.',
        'Seja objetivo com datas, etapas e conteúdos de avaliação — é o que ele usa para planejar.',
      ].join(' ');

    case 'coordenacao':
      return [
        `Você está falando com ${user.name}, da coordenação.`,
        'Dê a visão consolidada: abrangência das normas, prazos e o que está pendente.',
      ].join(' ');

    case 'admin':
      return [
        `Você está falando com ${user.name}, administrador(a) da plataforma.`,
        'Pode detalhar a proveniência das informações, incluindo vigência dos documentos.',
      ].join(' ');
  }
}

function systemPrompt(user: SessionUser, today: string): string {
  return `Você é o assistente oficial do Colégio Santa Dorotéia — Belo Horizonte.

QUEM ESTÁ PERGUNTANDO
${audienceBriefing(user)}

REGRA FUNDAMENTAL
Responda EXCLUSIVAMENTE com base nos trechos de documentos oficiais fornecidos abaixo. Você não tem nenhuma outra fonte. Se os trechos não contiverem a resposta, diga com todas as letras que a informação não está nos documentos disponíveis e sugira o que procurar ou com quem falar na secretaria. Nunca preencha lacuna com conhecimento geral, suposição ou memória — uma data errada faz um aluno perder prova.

COMO CITAR
Cada trecho vem numerado como [1], [2], ... Marque no texto de onde veio cada afirmação, usando a mesma notação, logo depois da frase. Se juntar duas fontes, marque as duas: [1][3]. Não invente números de referência.

COMO RESPONDER
- Português do Brasil, direto ao ponto. Sem saudação protocolar e sem repetir a pergunta.
- Datas sempre por extenso e com o dia da semana quando der: "quinta-feira, 12 de junho de 2026".
- Mais de uma data, matéria ou prazo? Use lista. Uma informação só? Uma frase basta.
- Não use cabeçalho em markdown (#). Negrito só no que a pessoa precisa reter: data, matéria, prazo.
- Se os documentos se contradisserem, mostre as duas versões e aponte qual é o mais recente.
- Hoje é ${today}. Ao falar de algo que já passou, diga isso explicitamente.`;
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const label = [
        documentTypeLabel(chunk.type as DocumentTypeValue),
        chunk.docNumber ? `nº ${chunk.docNumber}` : null,
        chunk.title,
        chunk.anoLetivo ? `ano letivo ${chunk.anoLetivo}` : null,
        chunk.series.length ? chunk.series.map(serieLabel).join(', ') : null,
        chunk.page ? `página ${chunk.page}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return `[${index + 1}] ${label}\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  // Um documento pode contribuir com vários trechos; a citação é por documento.
  const byDocument = new Map<string, Citation>();
  for (const chunk of chunks) {
    if (byDocument.has(chunk.documentId)) continue;
    byDocument.set(chunk.documentId, {
      documentId: chunk.documentId,
      title: chunk.title,
      type: chunk.type,
      docNumber: chunk.docNumber,
      page: chunk.page,
      excerpt: chunk.content.replace(/\s+/g, ' ').slice(0, 260).trim(),
    });
  }
  return [...byDocument.values()];
}

export interface AnswerChunkEvent {
  type: 'delta';
  text: string;
}

export interface AnswerDoneEvent {
  type: 'done';
  citations: Citation[];
  usage: { promptTokens: number | null; completionTokens: number | null; model: string };
}

export type AnswerEvent = AnswerChunkEvent | AnswerDoneEvent;

export interface AnswerOptions {
  user: SessionUser;
  question: string;
  chunks: RetrievedChunk[];
  /** Histórico recente, para perguntas de acompanhamento ("e a de história?"). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Gera a resposta em streaming, emitindo eventos consumíveis pela rota HTTP. */
export async function* streamAnswer(options: AnswerOptions): AsyncGenerator<AnswerEvent> {
  const { user, question, chunks, history } = options;
  const citations = toCitations(chunks);

  if (chunks.length === 0) {
    yield {
      type: 'delta',
      text:
        'Não encontrei nada sobre isso nos documentos oficiais que estão disponíveis para você. ' +
        'Vale tentar reformular a pergunta com o nome do comunicado, a matéria ou o mês — e, se a ' +
        'informação for recente, pode ser que o documento ainda não tenha sido publicado no sistema.',
    };
    yield {
      type: 'done',
      citations: [],
      usage: { promptTokens: null, completionTokens: null, model: 'sem-fonte' },
    };
    return;
  }

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  if (DEMO_MODE) {
    yield* demoAnswer(chunks);
    yield {
      type: 'done',
      citations,
      usage: { promptTokens: null, completionTokens: null, model: 'demo' },
    };
    return;
  }

  const stream = await openai().chat.completions.create({
    model: AI_MODELS.chat,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: systemPrompt(user, today) },
      ...history.slice(-6),
      {
        role: 'user',
        content: `TRECHOS DOS DOCUMENTOS OFICIAIS:\n\n${buildContext(chunks)}\n\n---\n\nPERGUNTA: ${question}`,
      },
    ],
  });

  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) yield { type: 'delta', text: delta };
    if (part.usage) {
      promptTokens = part.usage.prompt_tokens;
      completionTokens = part.usage.completion_tokens;
    }
  }

  yield {
    type: 'done',
    citations,
    usage: { promptTokens, completionTokens, model: AI_MODELS.chat },
  };
}

/** Resposta extrativa para o modo sem chave: mostra o que a busca achou. */
async function* demoAnswer(chunks: RetrievedChunk[]): AsyncGenerator<AnswerChunkEvent> {
  const text =
    'Modo demonstração (sem OPENAI_API_KEY): não há geração de linguagem, então segue o que a ' +
    'busca encontrou nos documentos oficiais.\n\n' +
    chunks
      .slice(0, 3)
      .map((c, i) => `**${c.title}** [${i + 1}]\n${c.content.replace(/\s+/g, ' ').slice(0, 400)}…`)
      .join('\n\n');

  // Fatiado para o cliente exercitar o mesmo caminho de streaming da IA real.
  for (const piece of text.match(/.{1,24}/gs) ?? []) {
    yield { type: 'delta', text: piece };
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}
