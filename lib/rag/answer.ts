import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';
import type { SessionUser } from '@/lib/auth/session';
import { documentTypeLabel, serieLabel } from '@/lib/taxonomy';
import { currentEtapa, formatToday, type Etapa } from '@/lib/academic-calendar';
import type { TenantSettings } from '@/lib/db/schema';
import { formatEventsForPrompt, type UpcomingEvent } from './events';
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
      // O contexto do aluno é deliberadamente curto: nome e série, nada mais.
      // Quem recorta o que ele pode ver é o filtro de acesso na busca, não o
      // prompt — e instrução demais aqui só enviesa a resposta.
      return [
        `Você está falando com ${user.name}, do ${serieLabel(user.serie)}.`,
        'A pergunta pode vir do próprio aluno ou do responsável — trate igual.',
        'Fale de forma direta e acolhedora, sem jargão administrativo.',
        'Nunca comente notas, situação financeira ou dados de outros alunos.',
      ].join(' ');

    case 'professor': {
      const contexto = [
        user.disciplinas.length > 0 ? `Leciona ${user.disciplinas.join(', ')}.` : null,
        user.seriesTaught.length > 0
          ? `Dá aula para ${user.seriesTaught.map(serieLabel).join(', ')}.`
          : null,
      ]
        .filter(Boolean)
        .join(' ');

      return [
        `Você está falando com ${user.name}, professor(a) do colégio.`,
        contexto,
        'Pode usar linguagem técnica e pedagógica, e citar normas e prazos internos.',
        'O professor enxerga todas as séries: quando a resposta variar por série, ' +
          'organize por série em vez de escolher uma.',
      ]
        .filter(Boolean)
        .join(' ');
    }

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

function systemPrompt(
  user: SessionUser,
  today: string,
  etapa: Etapa,
  institutionalContext: string | null,
): string {
  const quando = etapa.emAndamento
    ? `Hoje é ${today}. O colégio divide o ano letivo em três etapas, e estamos na ${etapa.label} de ${etapa.anoLetivo}.`
    : `Hoje é ${today}, fora do período letivo. A referência mais próxima é a ${etapa.label} de ${etapa.anoLetivo}.`;

  return `Você é o assistente oficial do Colégio Santa Dorotéia — Belo Horizonte.

QUEM ESTÁ PERGUNTANDO
${audienceBriefing(user)}

QUANDO
${quando}
Use isso para entender referências como "a prova" ou "esta etapa" e para dizer quando algo já passou. Mas **não restrinja a resposta à etapa atual por conta própria**: se o documento fala de outra etapa e responde à pergunta, use assim mesmo, deixando claro a que etapa se refere.
${institutionalContext ? `\nSOBRE O COLÉGIO\nInformações gerais registradas pela administração. Valem como contexto de apoio; se um documento oficial disser outra coisa, o documento prevalece.\n${institutionalContext}\n` : ''}
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
- Ao falar de algo que já passou, diga isso explicitamente.

AGENDA
Os trechos dos documentos são sempre a fonte principal, inclusive para datas. Quando aparecer também um bloco "AGENDA", ele é um índice de datas que já foram extraídas e conferidas — um atalho, não um substituto. Use-o para ordenar e para não deixar passar nada, mas confira contra os trechos e cite o documento de origem. Se uma data aparece nos trechos e não na agenda, ela vale do mesmo jeito: a agenda pode estar incompleta.

SE A SUPOSIÇÃO FOR SUA
Quando o bloco "SUPOSIÇÃO" aparecer, comece a resposta reconhecendo-a em meia frase natural ("Considerando a 3ª etapa, que é a atual: …") e siga. Não transforme isso num aviso separado nem peça confirmação.`;
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
  /** Configurações do colégio: etapas, fuso e contexto institucional. */
  settings?: TenantSettings | null;
  question: string;
  chunks: RetrievedChunk[];
  /** Histórico recente, para perguntas de acompanhamento ("e a de história?"). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Agenda já filtrada para esta pessoa; vazia quando a pergunta não é de data. */
  events?: UpcomingEvent[];
  /** Leitura que o planejador assumiu, quando escolheu não perguntar de volta. */
  assumption?: string | null;
}

/** Gera a resposta em streaming, emitindo eventos consumíveis pela rota HTTP. */
export async function* streamAnswer(options: AnswerOptions): AsyncGenerator<AnswerEvent> {
  const { user, question, chunks, history, events = [], assumption, settings } = options;
  const citations = toCitations(chunks);

  // Sem trecho E sem agenda não há do que responder. Com agenda, ainda dá:
  // "quais as próximas provas" se resolve só com o calendário.
  if (chunks.length === 0 && events.length === 0) {
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

  const today = formatToday(settings);
  const etapa = currentEtapa(settings);

  if (DEMO_MODE) {
    yield* demoAnswer(chunks, events);
    yield {
      type: 'done',
      citations,
      usage: { promptTokens: null, completionTokens: null, model: 'demo' },
    };
    return;
  }

  const sections: string[] = [];

  if (events.length > 0) {
    sections.push(
      `AGENDA (índice de datas já extraídas e conferidas, filtrado para esta pessoa — ` +
        `complementa os trechos, não os substitui):\n${formatEventsForPrompt(events)}`,
    );
  }
  if (chunks.length > 0) {
    sections.push(`TRECHOS DOS DOCUMENTOS OFICIAIS:\n\n${buildContext(chunks)}`);
  }
  if (assumption) {
    sections.push(`SUPOSIÇÃO: ${assumption}`);
  }
  sections.push(`PERGUNTA: ${question}`);

  const stream = await openai().chat.completions.create({
    model: AI_MODELS.chat,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      {
        role: 'system',
        content: systemPrompt(user, today, etapa, settings?.institutionalContext?.trim() || null),
      },
      ...history.slice(-6),
      { role: 'user', content: sections.join('\n\n---\n\n') },
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
async function* demoAnswer(
  chunks: RetrievedChunk[],
  events: UpcomingEvent[],
): AsyncGenerator<AnswerChunkEvent> {
  const parts = [
    'Modo demonstração (sem OPENAI_API_KEY): não há geração de linguagem, então segue o que a ' +
      'busca encontrou nos documentos oficiais.',
  ];

  if (events.length > 0) {
    parts.push(`**Agenda para você**\n${formatEventsForPrompt(events.slice(0, 8))}`);
  }

  parts.push(
    ...chunks
      .slice(0, 3)
      .map((c, i) => `**${c.title}** [${i + 1}]\n${c.content.replace(/\s+/g, ' ').slice(0, 400)}…`),
  );

  const text = parts.join('\n\n');

  // Fatiado para o cliente exercitar o mesmo caminho de streaming da IA real.
  for (const piece of text.match(/.{1,24}/gs) ?? []) {
    yield { type: 'delta', text: piece };
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}
