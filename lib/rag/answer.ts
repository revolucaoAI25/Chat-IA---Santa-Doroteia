import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';
import type { SessionUser } from '@/lib/auth/session';
import { documentTypeLabel, SEGMENT_LABELS, serieLabel } from '@/lib/taxonomy';
import { currentEtapa, formatToday, type Etapa } from '@/lib/academic-calendar';
import type { DocumentTypeValue, Segment, TenantSettings } from '@/lib/db/schema';
import { formatEventsForPrompt, type UpcomingEvent } from './events';
import type { RetrievedChunk } from './retrieve';

/**
 * O que a interface precisa para mostrar a fonte sem uma consulta a mais.
 *
 * Os campos além dos quatro primeiros são opcionais porque as mensagens
 * gravadas antes desta versão não os têm — a tela precisa continuar
 * renderizando uma conversa antiga sem quebrar.
 */
export interface Citation {
  documentId: string;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  excerpt: string;
  anoLetivo?: number | null;
  etapa?: string | null;
  documentDate?: string | null;
  series?: string[];
  segments?: string[];
  validUntil?: string | null;
  mimeType?: string | null;
  /** Todos os trechos deste documento que foram ao prompt, na ordem do texto. */
  excerpts?: Array<{ page: number | null; text: string }>;
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
        'A mensagem pode ser do próprio aluno ou do responsável por ele — trate os dois igual, e não tente adivinhar qual é.',
        'Fale como quem atende na secretaria: direto, acolhedor, sem jargão administrativo e sem tom de circular.',
        'O que o colégio cobra dos professores e da coordenação é informação de apoio, não obrigação desta pessoa.',
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
        'Prazos e obrigações do corpo docente são desta pessoa: trate-os como o que ela precisa cumprir, com a data em destaque.',
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
        'Pode falar tanto do que cabe ao corpo docente quanto do que é comunicado às famílias, deixando claro qual é qual.',
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
Responda EXCLUSIVAMENTE com base nos trechos de documentos oficiais fornecidos abaixo. Você não tem nenhuma outra fonte. Nunca preencha lacuna com conhecimento geral, suposição, memória ou com o que "costuma ser assim numa escola" — uma data errada faz um aluno perder prova.
Não afirme nada que você não consiga apontar num trecho. Isso vale também para o detalhe pequeno: horário, sala, valor, número de comunicado, nome de professor. Se o documento diz "das 13h às 18h" e não diz a sala, a resposta não menciona sala.
Quando a resposta não estiver nos trechos, diga isso com todas as letras, sem rodeio e sem pedir desculpas duas vezes, e aponte o caminho: qual comunicado procurar, ou falar com a secretaria. Uma resposta honesta de duas linhas vale mais que um parágrafo que parece resposta.

PERSPECTIVA
Escreva para quem está perguntando, na segunda pessoa, do lugar dela na escola.
- Não trate um aluno como se ele fosse professor, nem o contrário. O mesmo documento se lê diferente dos dois lados: o prazo que o professor tem para lançar notas é obrigação DELE; para o aluno, é só quando a nota fica disponível.
- Quando o documento fala de alguém que não é quem pergunta, diga de quem se trata ("os professores precisam…", "a coordenação divulga…") em vez de deixar no impessoal e induzir a pessoa a achar que a tarefa é dela.
- Se a pergunta revela confusão sobre o próprio papel ("preciso entregar as notas?" vindo de um aluno), esclareça em meia frase, sem lição de moral.

COMO CITAR
Cada DOCUMENTO vem numerado como [1], [2], ... — um número por documento, mesmo quando aparecem vários trechos dele, separados por [...].
Marque no texto de onde veio cada afirmação, usando a mesma notação, logo depois da frase. Se juntar duas fontes, marque as duas: [1][3]. Não invente números de referência.
**Marque tudo o que usou, e só o que usou.** A lista de fontes que aparece embaixo da resposta é montada a partir dessas marcas: documento que você não marcar não é mostrado, e documento marcado sem ter sido usado polui a conferência. Vêm mais documentos do que os necessários de propósito — os que não responderem à pergunta, simplesmente ignore, sem comentar que os descartou.
Nomeie o documento pelo que ele é ("o Comunicado nº 240"), nunca pelo mecanismo. Não escreva "segundo o trecho fornecido", "nos documentos disponibilizados", "na base de dados", "de acordo com o contexto": quem lê não sabe que existe busca por trás, e não precisa saber.

COMO RESPONDER
- Português do Brasil, direto ao ponto. Sem saudação protocolar, sem repetir a pergunta, sem fecho do tipo "espero ter ajudado" ou "qualquer dúvida, estou à disposição".
- Comece pela resposta. Contexto, condição e exceção vêm depois — se vierem.
- Tamanho é consequência da pergunta, não estilo: uma data pede uma frase; "como funciona a recuperação" pede o procedimento inteiro. Ser conciso é cortar enrolação, nunca informação. Se o documento traz três condições, as três entram.
- Nunca resuma uma lista com "entre outros", "etc." ou "entre as matérias". Se a pergunta pede a lista, dê a lista inteira.
- Datas sempre por extenso e com o dia da semana quando der: "quinta-feira, 12 de junho de 2026". Horários, valores e prazos exatamente como estão no documento.
- Lista só a partir de três itens, ou quando cada linha tem data e assunto. Dois fatos cabem numa frase.

FORMATAÇÃO
A tela renderiza markdown, então use — com parcimônia:
- **Negrito** no que a pessoa precisa reter: a data, a matéria, o prazo, o valor. Uma ou duas marcas por parágrafo; texto todo em negrito não destaca nada.
- *Itálico* para uma ressalva curta ou o nome de um evento. Raro.
- Listas com \`-\` para itens sem ordem, e \`1.\` quando a ordem ou a sequência importa (um procedimento, por exemplo).
- Quando a resposta cobre assuntos distintos, abra cada bloco com uma linha só de título em negrito ("**Provas finais**"). Só a partir de dois blocos; numa resposta de um parágrafo, título é ruído.
NÃO use: cabeçalho markdown (#), tabela, emoji, linha horizontal (---), bloco de código, link markdown. As fontes já aparecem sozinhas embaixo da resposta — não escreva uma seção de "Fontes" nem repita títulos de documento no fim.
- Se os documentos se contradisserem, mostre as duas versões e aponte qual é o mais recente.
- Ao falar de algo que já passou, diga isso explicitamente.

SÉRIE E ABRANGÊNCIA
Os trechos vêm rotulados com a série e o segmento a que o documento se refere. Um documento pode tratar de outra série que não a de quem pergunta — isso é normal, o acervo é aberto.
- Priorize o que vale para a série da pessoa.
- Se usar informação de outra série, diga de qual é ("o cronograma do 9º ano prevê…"). Nunca apresente o dado de uma série como se fosse o da pessoa.
- Se a pergunta é sobre a série dela e só existe documento de outra, responda que para a série dela não há documento publicado, e mencione o que existe.

AGENDA
Os documentos são sempre a fonte principal, inclusive para datas. Quando aparecer também um bloco "AGENDA", ele é um índice de datas que já foram extraídas e conferidas — um atalho, não um substituto. Use-o para ordenar e para não deixar passar nada, mas confira contra os trechos e cite o documento de origem. Se uma data aparece nos trechos e não na agenda, ela vale do mesmo jeito: a agenda pode estar incompleta.

SE A SUPOSIÇÃO FOR SUA
Quando o bloco "SUPOSIÇÃO" aparecer, comece a resposta reconhecendo-a em meia frase natural ("Considerando a 3ª etapa, que é a atual: …") e siga. Não transforme isso num aviso separado nem peça confirmação.`;
}

/** Quantos trechos do mesmo documento o painel lateral mostra. */
const MAX_EXCERPTS = 4;

/** Um documento e todos os trechos dele que entraram no prompt. */
interface SourceGroup {
  citation: Citation;
  chunks: RetrievedChunk[];
}

/**
 * Agrupa os trechos por documento — a unidade de citação.
 *
 * O contexto do prompt e a lista de fontes saem os dois daqui, e não de duas
 * varreduras paralelas, porque a numeração precisa bater. Antes o prompt
 * numerava por TRECHO e a lista de fontes era por DOCUMENTO: bastava um
 * documento contribuir com dois trechos para o [4] do texto apontar para a
 * quarta fonte, que já era outro documento. A pessoa clicava para conferir a
 * data e abria o comunicado errado — o pior tipo de erro num sistema cuja
 * promessa é justamente poder conferir.
 */
function groupByDocument(chunks: RetrievedChunk[]): SourceGroup[] {
  const byDocument = new Map<string, SourceGroup>();

  for (const chunk of chunks) {
    const excerpt = {
      page: chunk.page,
      text: chunk.content.replace(/[ \t]+/g, ' ').trim(),
    };

    const existing = byDocument.get(chunk.documentId);
    if (existing) {
      existing.chunks.push(chunk);
      if (existing.citation.excerpts!.length < MAX_EXCERPTS) {
        existing.citation.excerpts!.push(excerpt);
      }
      continue;
    }

    byDocument.set(chunk.documentId, {
      chunks: [chunk],
      citation: {
        documentId: chunk.documentId,
        title: chunk.title,
        type: chunk.type,
        docNumber: chunk.docNumber,
        page: chunk.page,
        // Resumo curto, para o cartão fechado. O texto inteiro fica em `excerpts`.
        excerpt: excerpt.text.replace(/\s+/g, ' ').slice(0, 260).trim(),
        anoLetivo: chunk.anoLetivo,
        etapa: chunk.etapa,
        documentDate: chunk.documentDate,
        series: chunk.series,
        segments: chunk.segments,
        validUntil: chunk.validUntil,
        mimeType: chunk.mimeType,
        excerpts: [excerpt],
      },
    });
  }

  return [...byDocument.values()];
}

export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return groupByDocument(chunks).map((group) => group.citation);
}

function buildContext(groups: SourceGroup[]): string {
  return groups
    .map((group, index) => {
      const head = group.chunks[0];

      // A abrangência é explícita nos dois sentidos: dizer "toda a escola"
      // evita que o modelo trate a ausência de série como omissão e invente um
      // recorte que o documento não tem.
      const abrangencia = head.series.length
        ? head.series.map(serieLabel).join(', ')
        : head.segments.length
          ? head.segments.map((s) => SEGMENT_LABELS[s as Segment] ?? s).join(', ')
          : 'toda a escola';

      const label = [
        documentTypeLabel(head.type as DocumentTypeValue),
        head.docNumber ? `nº ${head.docNumber}` : null,
        head.title,
        // A data de emissão fica no rótulo para o modelo saber qual documento
        // prevalece quando dois se contradizem — a regra existe no prompt, e
        // sem esta linha ela não teria como ser cumprida.
        head.documentDate ? `emitido em ${head.documentDate}` : null,
        head.anoLetivo ? `ano letivo ${head.anoLetivo}` : null,
        `refere-se a: ${abrangencia}`,
      ]
        .filter(Boolean)
        .join(' · ');

      const body = group.chunks
        .map((chunk) => (chunk.page ? `(página ${chunk.page})\n${chunk.content}` : chunk.content))
        .join('\n\n[…]\n\n');

      return `[${index + 1}] ${label}\n${body}`;
    })
    .join('\n\n---\n\n');
}

/** Marca de citação: `[3]`, e também o `[1, 3]` que o modelo às vezes escreve. */
const CITATION_MARK = /\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g;

export interface UsedSources {
  /** Só os documentos de onde saiu alguma informação, na ordem em que aparecem. */
  citations: Citation[];
  /** O texto com as marcas renumeradas para 1..n, sem buracos. */
  answer: string;
}

/**
 * Reduz as fontes ao que a resposta de fato usou.
 *
 * A busca é deliberadamente ampla — chega a trazer trinta trechos — porque o
 * custo de deixar o documento certo de fora é alto. Mas mostrar as trinta
 * embaixo da resposta transfere para a pessoa o trabalho de descobrir quais
 * importaram, e enterra a conversa: a cada pergunta ela precisa rolar por uma
 * pilha de comunicados que nada têm a ver com o assunto.
 *
 * As marcas [n] que o modelo escreveu são a resposta a essa pergunta — ele
 * marcou de onde tirou cada afirmação. Ficam só essas, renumeradas para 1..n
 * para o texto não sair com [2] e [7] e nenhum [1].
 *
 * Se não houver nenhuma marca, devolvemos tudo: o modelo pode ter esquecido de
 * citar, e é melhor a lista longa do que uma resposta sem procedência nenhuma.
 */
export function usedSources(answer: string, all: Citation[]): UsedSources {
  const order: number[] = [];

  for (const match of answer.matchAll(CITATION_MARK)) {
    for (const part of match[1].split(/[,;]/)) {
      const n = Number(part.trim());
      // Número fora da lista é alucinação do modelo; ignorar aqui é o que
      // impede que ele crie uma fonte que não existe.
      if (n >= 1 && n <= all.length && !order.includes(n)) order.push(n);
    }
  }

  /*
   * Sem nenhuma marca válida, a lista fica inteira — o modelo pode ter esquecido
   * de citar, e uma resposta sem procedência nenhuma é pior que uma lista longa.
   * O texto ainda passa pela reescrita: um [9] que não existe vira um botão que
   * não abre nada, e some.
   */
  const renumber =
    order.length === 0
      ? new Map(all.map((_, i) => [i + 1, i + 1]))
      : new Map(order.map((old, i) => [old, i + 1]));

  const rewritten = answer.replace(CITATION_MARK, (whole, group: string) => {
    const kept = group
      .split(/[,;]/)
      .map((part) => renumber.get(Number(part.trim())))
      .filter((n): n is number => n !== undefined);
    // Cada número em seu próprio par de colchetes: é a única forma que a tela
    // sabe transformar em botão. Marca que não sobrou nenhuma fonte sai do
    // texto — deixá-la seria um botão que não abre nada.
    return kept.map((n) => `[${n}]`).join('');
  });

  return {
    citations: order.length === 0 ? all : order.map((n) => all[n - 1]),
    answer: rewritten,
  };
}

export interface AnswerChunkEvent {
  type: 'delta';
  text: string;
}

export interface AnswerDoneEvent {
  type: 'done';
  citations: Citation[];
  /**
   * A resposta inteira, com as marcas de citação renumeradas.
   *
   * O cliente montou o texto a partir dos deltas, mas só no fim se sabe quais
   * fontes sobraram — então a última palavra sobre o texto é esta, e é ela que
   * também vai para o banco.
   */
  answer: string;
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
  const groups = groupByDocument(chunks);
  const citations = groups.map((group) => group.citation);

  // Sem trecho E sem agenda não há do que responder. Com agenda, ainda dá:
  // "quais as próximas provas" se resolve só com o calendário.
  if (chunks.length === 0 && events.length === 0) {
    const text =
      'Não encontrei nada sobre isso nos documentos oficiais que estão disponíveis para você. ' +
      'Vale tentar reformular a pergunta com o nome do comunicado, a matéria ou o mês — e, se a ' +
      'informação for recente, pode ser que o documento ainda não tenha sido publicado no sistema.';

    yield { type: 'delta', text };
    yield {
      type: 'done',
      citations: [],
      answer: text,
      usage: { promptTokens: null, completionTokens: null, model: 'sem-fonte' },
    };
    return;
  }

  const today = formatToday(settings);
  const etapa = currentEtapa(settings);

  if (DEMO_MODE) {
    let demo = '';
    for await (const event of demoAnswer(chunks, events)) {
      demo += event.text;
      yield event;
    }
    const used = usedSources(demo, citations);
    yield {
      type: 'done',
      citations: used.citations,
      answer: used.answer,
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
  if (groups.length > 0) {
    sections.push(`DOCUMENTOS OFICIAIS:\n\n${buildContext(groups)}`);
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
  let answer = '';

  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) {
      answer += delta;
      yield { type: 'delta', text: delta };
    }
    if (part.usage) {
      promptTokens = part.usage.prompt_tokens;
      completionTokens = part.usage.completion_tokens;
    }
  }

  // Só agora dá para saber quais documentos a resposta usou de verdade.
  const used = usedSources(answer, citations);

  yield {
    type: 'done',
    citations: used.citations,
    answer: used.answer,
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
