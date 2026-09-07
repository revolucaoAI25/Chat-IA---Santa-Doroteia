import { z } from 'zod';
import { AI_MODELS, DEMO_MODE, openai } from '@/lib/ai/provider';
import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABELS, serieLabel } from '@/lib/taxonomy';
import { currentEtapa, resolveCalendar, todayISO, type Etapa } from '@/lib/academic-calendar';
import type { TenantSettings } from '@/lib/db/schema';

/**
 * Planejamento da pergunta, antes de buscar.
 *
 * Resolve dois problemas que a busca sozinha não resolve:
 *
 * 1. **Follow-up.** "E a de história?" não recupera nada — não tem sujeito.
 *    Aqui vira "prova de história do 7º ano na 3ª etapa", que recupera.
 * 2. **Ambiguidade.** Às vezes perguntar de volta é o certo. Quase sempre não
 *    é: perguntar demais é atrito, e o sistema já sabe série, turma e papel.
 *    A regra é responder assumindo a leitura mais provável e DIZER qual foi —
 *    só perguntar quando as leituras levam a respostas incompatíveis.
 *
 * É uma chamada pequena (poucas centenas de tokens) que evita buscas inúteis,
 * então costuma se pagar.
 */

const planSchema = z.object({
  searchQuery: z.string().min(1),
  /** Outras formulações da mesma pergunta, para a busca vetorial não depender de uma só. */
  altQueries: z.array(z.string()).max(2),
  intent: z.enum(['documentos', 'agenda', 'ambos']),
  breadth: z.enum(['foco', 'amplo']),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  clarifyOptions: z.array(z.string()).max(4),
  assumption: z.string().nullable(),
});

export type QueryPlan = z.infer<typeof planSchema>;

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'searchQuery', 'altQueries', 'intent', 'breadth', 'needsClarification',
    'clarifyingQuestion', 'clarifyOptions', 'assumption',
  ],
  properties: {
    searchQuery: { type: 'string' },
    altQueries: { type: 'array', items: { type: 'string' } },
    intent: { type: 'string', enum: ['documentos', 'agenda', 'ambos'] },
    breadth: { type: 'string', enum: ['foco', 'amplo'] },
    needsClarification: { type: 'boolean' },
    clarifyingQuestion: { type: ['string', 'null'] },
    clarifyOptions: { type: 'array', items: { type: 'string' } },
    assumption: { type: ['string', 'null'] },
  },
} as const;

function systemPrompt(user: SessionUser, today: string, etapa: Etapa): string {
  const perfil = [
    `papel: ${ROLE_LABELS[user.role]}`,
    user.serie ? `série: ${serieLabel(user.serie)}` : null,
    user.disciplinas.length ? `leciona: ${user.disciplinas.join(', ')}` : null,
    user.seriesTaught.length
      ? `dá aula para: ${user.seriesTaught.map(serieLabel).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `Você prepara a busca de um assistente escolar. Não responde à pergunta — apenas decide COMO buscar.

QUEM PERGUNTA
${perfil}
Hoje é ${today}, ${etapa.emAndamento ? `na ${etapa.label} de ${etapa.anoLetivo}` : `fora do período letivo (última referência: ${etapa.label} de ${etapa.anoLetivo})`}.

"searchQuery"
Reescreva a pergunta como uma consulta autônoma, que faça sentido sem o histórico. Resolva pronomes e elipses usando as mensagens anteriores e o perfil acima. Mantenha os termos que a pessoa usou (o acervo é indexado com as palavras dos documentos) e acrescente o que estava implícito — série, etapa, matéria.
Exemplos:
- "e a de história?" depois de falar de provas, aluno do 7º ano -> "data da prova de história do 7º ano na etapa atual"
- "quando é?" depois de falar da festa junina -> "data e horário da festa junina"
- "o que cai?" -> "conteúdo da avaliação" + a matéria e a série do contexto

"altQueries" — até 2, podem ser 0
Outras formas de dizer a MESMA busca, com o vocabulário que o documento provavelmente usa, não o da pessoa. É o que salva quando a palavra da pergunta não é a palavra do papel timbrado.
Exemplos:
- "o que cai na prova de matemática" -> ["conteúdos programáticos da avaliação de matemática", "matriz de conteúdos matemática avaliação"]
- "posso entrar de tênis?" -> ["regras de uniforme escolar", "norma sobre vestimenta e calçado"]
- "quanto custa a formatura?" -> ["valores e formas de pagamento da formatura"]
Não repita a searchQuery. Se não houver formulação melhor, devolva lista vazia.

"intent"
- "agenda": a pergunta é sobre QUANDO algo acontece (datas, prazos, próximas provas, calendário).
- "documentos": a pergunta é sobre REGRAS ou CONTEÚDO (o que cai, como funciona, o que é permitido).
- "ambos": precisa das duas coisas.

"breadth"
- "foco": a pergunta tem uma resposta pontual — uma data, uma regra, um valor. É o caso comum.
- "amplo": a pergunta pede panorama e a resposta só está certa se for completa — "todos os prazos do semestre", "tudo que preciso saber sobre a recuperação", "quais eventos vêm por aí". Aqui a busca varre mais documentos.

"needsClarification" — o critério é rigoroso, e o padrão é FALSE
Só marque true quando as leituras possíveis levarem a respostas INCOMPATÍVEIS e você não tiver como escolher entre elas. Antes de marcar true, tente resolver por conta própria: o perfil acima costuma bastar.

NUNCA pergunte:
- a série, a turma ou o segmento de quem pergunta — já está no perfil acima;
- qual etapa, quando a etapa vigente informada acima já resolve;
- confirmação de algo que a pessoa já disse na conversa;
- detalhe que mudaria pouco a resposta.

Marque true, por exemplo, quando: a pessoa pede "a data da prova" sem dizer a matéria e existem várias matérias possíveis; ou fala de "recuperação" sem dizer se é da etapa ou final, e as regras são diferentes.

"clarifyingQuestion": UMA pergunta curta, em tom de conversa. Nada de "poderia especificar". Prefira "De qual matéria?".
"clarifyOptions": até 4 respostas prováveis, curtas, que a pessoa possa clicar. Vazio se não der para listar.
"assumption": quando needsClarification for false MAS você tiver escolhido uma leitura entre várias, escreva em meia frase o que assumiu ("considerei a 3ª etapa, que é a atual"). Se a pergunta era clara, deixe null. Isto é o que permite responder sem perguntar: a pessoa vê a suposição e corrige se estiver errada.`;
}

export interface PlanInput {
  user: SessionUser;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  settings?: TenantSettings | null;
}

export async function planQuery(input: PlanInput): Promise<QueryPlan> {
  const { user, question, history, settings } = input;

  if (DEMO_MODE) return fallbackPlan(question);

  const today = todayISO(new Date(), resolveCalendar(settings).timezone);
  const etapa = currentEtapa(settings);

  try {
    const response = await openai().chat.completions.create({
      model: AI_MODELS.planner,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt(user, today, etapa) },
        // Só o histórico recente importa para resolver o follow-up, e cada
        // mensagem é truncada para o planejador continuar barato.
        ...history.slice(-4).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 700),
        })),
        { role: 'user' as const, content: question },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'query_plan', strict: true, schema: jsonSchema },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return fallbackPlan(question);

    const parsed = planSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fallbackPlan(question);

    const plan = parsed.data;

    // Um pedido de esclarecimento sem pergunta não serve para nada: melhor
    // responder com o que temos do que travar a conversa.
    if (plan.needsClarification && !plan.clarifyingQuestion?.trim()) {
      return { ...plan, needsClarification: false, clarifyingQuestion: null, clarifyOptions: [] };
    }

    return plan;
  } catch (error) {
    // O planejador é uma otimização, não um requisito: se falhar, busca-se a
    // pergunta como veio.
    console.warn('Planejamento da consulta falhou, usando a pergunta original:', error);
    return fallbackPlan(question);
  }
}

/** Sem modelo (ou em caso de erro): busca literal, sem esclarecimento. */
function fallbackPlan(question: string): QueryPlan {
  const lower = question.toLowerCase();
  const agenda = /\bquando\b|\bdata\b|\bhorário\b|\bhorario\b|pr[óo]xim|calend[áa]rio|prazo|que dia/.test(
    lower,
  );

  const amplo = /\btodos?\b|\btodas?\b|\blista\b|\blistar\b|\bquais\b|panorama|resumo|semestre|\bano\b/.test(
    lower,
  );

  return {
    searchQuery: question,
    altQueries: [],
    intent: agenda ? 'agenda' : 'documentos',
    breadth: amplo ? 'amplo' : 'foco',
    needsClarification: false,
    clarifyingQuestion: null,
    clarifyOptions: [],
    assumption: null,
  };
}
