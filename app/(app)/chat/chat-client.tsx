'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerText } from '@/components/answer-text';
import {
  AlertIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  FileIcon,
  SparkleIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from '@/components/icons';
import { SourcePanel, type SourceDocument } from '@/components/source-panel';
import { DOCUMENT_TYPE_LABELS, ROLE_LABELS, serieLabel } from '@/lib/taxonomy';
import type { SessionUser } from '@/lib/auth/session';
import type { DocumentTypeValue } from '@/lib/db/schema';

type Citation = SourceDocument;

/** Chave da thread na aba. */
const CONVERSATION_KEY = 'sd_conversation';

/**
 * Teto da caixa de pergunta, em pixels (~7 linhas).
 *
 * Existe teto porque sem ele um texto longo colado empurraria a conversa toda
 * para fora da tela. Passando daqui, a caixa para de crescer e rola por dentro.
 */
const MAX_COMPOSER_PX = 176;

function rememberConversation(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CONVERSATION_KEY, id);
    else sessionStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // Sem sessionStorage, a thread simplesmente não sobrevive à navegação.
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Verdadeiro entre o envio e o primeiro token da resposta. */
  pending?: boolean;
  error?: string;
  /** Id no banco, necessário para registrar o feedback. */
  messageId?: string;
  feedback?: 'util' | 'nao_util';
  /** Respostas prováveis quando o assistente pediu esclarecimento. */
  clarifyOptions?: string[];
}

export function ChatClient({
  user,
  suggestions,
}: {
  user: SessionUser;
  suggestions: string[];
}) {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * A thread vive na aba.
   *
   * `sessionStorage` sobrevive a ir ao perfil e voltar, ou a um F5 acidental —
   * a conversa continua de onde parou. Mas morre ao fechar a aba, que é o
   * "sair da página" esperado. O servidor ainda aposenta a thread depois de um
   * tempo sem interação, então uma aba deixada aberta a noite toda também
   * recomeça.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(CONVERSATION_KEY);
    } catch {
      // Modo privado ou cookies bloqueados: a conversa só não sobrevive à
      // navegação, o que é degradação aceitável.
    }

    if (!stored) {
      setRestoring(false);
      return;
    }

    let cancelled = false;

    // Retoma a thread com as mensagens na tela. Sem isto, o servidor
    // continuaria a conversa mas o usuário veria um chat vazio.
    fetch(`/api/conversation?id=${stored}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;

        if (!payload || payload.expired || payload.messages.length === 0) {
          rememberConversation(null);
          return;
        }

        setConversationId(stored);
        setItems(
          payload.messages.map(
            (m: {
              id: string;
              role: 'user' | 'assistant';
              content: string;
              citations: Citation[];
              feedback: 'util' | 'nao_util' | null;
            }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              citations: m.citations ?? [],
              messageId: m.role === 'assistant' ? m.id : undefined,
              feedback: m.feedback ?? undefined,
            }),
          ),
        );
      })
      .catch(() => rememberConversation(null))
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Fonte aberta no painel lateral, com o número da citação. */
  const [source, setSource] = useState<{ citation: Citation; index: number } | null>(null);

  /**
   * Quais respostas estão com a lista de fontes aberta.
   *
   * Fechada por padrão, e a escolha é por mensagem: abrir as fontes de uma
   * resposta não deve mexer na leitura das outras.
   */
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());

  const toggleSources = (id: string) =>
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items]);

  /*
   * A caixa acompanha o texto.
   *
   * Depende de `input` (e não do evento de digitação) para também encolher
   * quando a pergunta é enviada e o campo esvazia — ou quando o texto chega
   * pronto, vindo de um clique numa sugestão.
   */
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;

    // Zerar antes de medir: `scrollHeight` nunca diminui sozinho enquanto a
    // altura explícita anterior continuar valendo.
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_COMPOSER_PX)}px`;
    field.style.overflowY = field.scrollHeight > MAX_COMPOSER_PX ? 'auto' : 'hidden';
  }, [input]);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;

      setBusy(true);
      setInput('');

      const answerId = crypto.randomUUID();
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: text, citations: [] },
        { id: answerId, role: 'assistant', content: '', citations: [], pending: true },
      ]);

      const patch = (changes: Partial<ChatMessage>) =>
        setItems((prev) =>
          prev.map((item) => (item.id === answerId ? { ...item, ...changes } : item)),
        );

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, conversationId }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? 'Não foi possível falar com o assistente.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let answer = '';

        // NDJSON: acumulamos até a quebra de linha, porque um evento pode
        // chegar partido entre dois chunks da rede.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);

            if (event.type === 'start') {
              // O servidor pode ter aberto outra thread (inatividade), então
              // quem manda é o id que voltou, não o que enviamos.
              setConversationId(event.conversationId);
              rememberConversation(event.conversationId);
            } else if (event.type === 'delta') {
              answer += event.text;
              patch({ content: answer, pending: false });
            } else if (event.type === 'clarify') {
              patch({ clarifyOptions: event.options ?? [] });
            } else if (event.type === 'done') {
              // O texto final substitui o acumulado: as marcas de citação são
              // renumeradas no servidor depois que se sabe quais documentos a
              // resposta realmente usou.
              patch({
                content: event.answer || answer,
                citations: event.citations,
                messageId: event.messageId,
                pending: false,
              });
            } else if (event.type === 'error') {
              patch({ error: event.message, pending: false });
            }
          }
        }
      } catch (error) {
        patch({
          error: error instanceof Error ? error.message : 'Erro inesperado.',
          pending: false,
        });
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [busy, conversationId],
  );

  const startOver = () => {
    setItems([]);
    setConversationId(null);
    rememberConversation(null);
    setInput('');
    textareaRef.current?.focus();
  };

  const sendFeedback = async (item: ChatMessage, feedback: 'util' | 'nao_util') => {
    if (!item.messageId) return;

    // Otimista: o sinal é secundário, e travar a interface esperando a rede
    // atrapalharia mais do que ajudaria.
    setItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, feedback } : m)),
    );

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: item.messageId, feedback }),
      });
    } catch {
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, feedback: undefined } : m)),
      );
    }
  };

  /**
   * A marca [1] no texto abre a fonte no painel.
   *
   * Antes ela só rolava a tela até o cartão lá embaixo, o que obrigava a pessoa
   * a sair da conversa para conferir. O modelo às vezes cita um número que não
   * existe, então a chamada é tolerante: sem a fonte correspondente, nada
   * acontece.
   */
  const openSource = (citations: Citation[], index: number) => {
    const citation = citations[index - 1];
    if (citation) setSource({ citation, index });
  };

  // Enquanto restaura, não mostramos nem as sugestões nem a conversa: exibir
  // o estado vazio e trocá-lo meio segundo depois pisca a tela.
  const empty = items.length === 0 && !restoring;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[52rem] px-4 pb-10 pt-7 sm:px-6 lg:px-10 lg:pt-9">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">Chat fundamentado</p>
              <h1 className="display mt-2 text-[1.875rem] sm:text-[2.125rem] lg:text-[2.5rem]">Pergunte sobre os documentos oficiais</h1>
              <p className="mt-3 max-w-[38rem] text-[0.9375rem] leading-relaxed text-muted">
                As respostas são fundamentadas nos documentos oficiais. Os PDFs utilizados ficam
                disponíveis ao final de cada resposta.
              </p>
            </div>
            {!empty ? (
              <button type="button" onClick={startOver} className="btn-ghost shrink-0">
                Nova conversa
              </button>
            ) : null}
          </div>

          {/*
            Mostra exatamente o que vai para o prompt — nada além disso. A
            turma, por exemplo, está no cadastro mas não é enviada à IA, então
            exibi-la aqui daria a entender uma personalização que não existe.
          */}
          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.75rem] text-muted">
            <span className="eyebrow-muted">Falando com a IA como</span>
            <span className="chip">{ROLE_LABELS[user.role]}</span>
            {user.role === 'aluno' && user.serie ? (
              <span className="chip">{serieLabel(user.serie)}</span>
            ) : null}
            {user.role !== 'aluno' && user.disciplinas.length > 0 ? (
              <span className="chip">{user.disciplinas.join(', ')}</span>
            ) : null}
          </div>

          {empty ? (
            <div className="panel mt-8 p-7">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-navy">
                  <SparkleIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-[1rem] font-bold text-ink">Você pode começar por aqui</h2>
                  <p className="mt-0.5 text-[0.875rem] text-muted">
                    Escolha uma sugestão ou escreva sua própria pergunta.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="card group flex items-start justify-between gap-3 p-4 text-left transition-colors hover:border-navy/40 hover:bg-chip-soft"
                  >
                    <span className="text-[0.875rem] font-medium leading-snug text-ink">
                      {suggestion}
                    </span>
                    <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-navy opacity-40 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-9 space-y-8">
              {items.map((item) =>
                item.role === 'user' ? (
                  <div key={item.id} className="rise flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-navy-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                      {item.content}
                    </div>
                  </div>
                ) : (
                  <article key={item.id} className="rise">
                    <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-accent">
                      Assistente oficial
                    </p>

                    {item.pending ? (
                      <p className="flex items-center gap-1.5 text-muted" aria-live="polite">
                        <span className="sr-only">Consultando os documentos…</span>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            aria-hidden="true"
                            className="dot-flash h-2 w-2 rounded-full bg-navy"
                            style={{ animationDelay: `${i * 160}ms` }}
                          />
                        ))}
                      </p>
                    ) : null}

                    {item.content ? (
                      <AnswerText
                        content={item.content}
                        onCitationClick={(index) => openSource(item.citations, index)}
                      />
                    ) : null}

                    {item.error ? (
                      <p
                        role="alert"
                        className="mt-2 flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[0.8125rem] font-medium text-danger"
                      >
                        <AlertIcon className="h-4 w-4 shrink-0" />
                        {item.error}
                      </p>
                    ) : null}

                    {/* Respostas prováveis: um clique resolve a ambiguidade,
                        sem obrigar a pessoa a redigir de novo. */}
                    {item.clarifyOptions && item.clarifyOptions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.clarifyOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={busy}
                            onClick={() => void send(option)}
                            className="rounded-full border border-navy/35 bg-surface px-3.5 py-1.5 text-[0.8125rem] font-semibold text-navy transition-colors hover:bg-chip-soft disabled:opacity-50"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {/*
                      Rodapé único da resposta: fontes de um lado, sinal de
                      qualidade do outro, tudo na mesma linha discreta.

                      As fontes vinham como uma pilha de cartões com título em
                      serifa e três linhas de trecho cada. Com a busca ampla,
                      isso enterrava a conversa: para chegar à próxima pergunta
                      era preciso rolar por uma parede de comunicados. O
                      conteúdo continua todo aqui, a um clique — e a lista já
                      chega enxuta, só com os documentos que a resposta citou.
                    */}
                    {item.citations.length > 0 || (item.messageId && !item.pending) ? (
                      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {item.citations.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleSources(item.id)}
                            aria-expanded={openSources.has(item.id)}
                            aria-controls={`fontes-${item.id}`}
                            className="-ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.75rem] font-semibold text-muted transition-colors hover:bg-chip-soft hover:text-ink"
                          >
                            <ChevronDownIcon
                              className={`h-3.5 w-3.5 transition-transform ${
                                openSources.has(item.id) ? 'rotate-180' : ''
                              }`}
                            />
                            {item.citations.length === 1
                              ? '1 fonte'
                              : `${item.citations.length} fontes`}
                          </button>
                        ) : null}

                        {/* Sinal de qualidade. As respostas marcadas como não
                            úteis alimentam o relatório de lacunas do acervo. */}
                        {item.messageId && !item.pending ? (
                          <span className="ml-auto flex items-center gap-1">
                            {item.feedback ? (
                              <span className="text-[0.75rem] text-muted">
                                {item.feedback === 'util'
                                  ? 'Obrigado! Isso ajuda a calibrar o assistente.'
                                  : 'Anotado — a coordenação vê o que o acervo não responde.'}
                              </span>
                            ) : (
                              <>
                                <span className="mr-1 text-[0.75rem] text-muted">Ajudou?</span>
                                <button
                                  type="button"
                                  onClick={() => void sendFeedback(item, 'util')}
                                  aria-label="Resposta útil"
                                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-chip-soft hover:text-success"
                                >
                                  <ThumbUpIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void sendFeedback(item, 'nao_util')}
                                  aria-label="Resposta não ajudou"
                                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-chip-soft hover:text-danger"
                                >
                                  <ThumbDownIcon className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </span>
                        ) : null}
                      </footer>
                    ) : null}

                    {/*
                      Aberta, a lista é uma linha por documento — sem trecho.
                      Quem quer conferir o texto clica e o painel lateral abre
                      com os trechos e o PDF; repetir o excerto aqui recriaria a
                      parede que este desenho existe para evitar.
                    */}
                    {item.citations.length > 0 && openSources.has(item.id) ? (
                      <ul id={`fontes-${item.id}`} className="mt-1.5 space-y-1">
                        {item.citations.map((citation, index) => (
                          <li key={citation.documentId}>
                            <button
                              type="button"
                              onClick={() => setSource({ citation, index: index + 1 })}
                              className="group flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-navy/40 hover:bg-chip-soft"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-chip text-[0.6875rem] font-bold text-navy">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                                {citation.title}
                                <span className="text-muted">
                                  {citation.docNumber ? ` · nº ${citation.docNumber}` : ''}
                                  {' · '}
                                  {DOCUMENT_TYPE_LABELS[citation.type as DocumentTypeValue] ??
                                    'Documento'}
                                </span>
                              </span>
                              <FileIcon className="h-3.5 w-3.5 shrink-0 text-navy opacity-40 transition-opacity group-hover:opacity-100" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/*
        A caixa de pergunta é uma caixa, não uma faixa: fica dentro da mesma
        coluna do conteúdo, sem borda atravessando a tela inteira. Ela começa com
        uma linha de altura e cresce com o texto até o teto de `MAX_COMPOSER_PX`,
        em vez de reservar duas linhas o tempo todo — numa tela de celular
        aquelas duas linhas fixas, mais rótulo e legenda, comiam quase um terço
        da altura útil do chat.
      */}
      <div className="shrink-0 bg-bg">
        <div className="mx-auto w-full max-w-[52rem] px-4 pb-3 sm:px-6 lg:px-10 lg:pb-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 rounded-3xl border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-[0_1px_2px_rgb(16_23_19_/_0.04)] transition-colors focus-within:border-navy/50 focus-within:shadow-[0_0_0_3px_rgb(15_59_133_/_0.10)]"
          >
            <label className="sr-only" htmlFor="question">
              Sua pergunta
            </label>
            <textarea
              id="question"
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              // Curto de propósito: num celular de 390px um texto mais longo
              // quebra em duas linhas, e a caixa nasce alta pelo texto de
              // exemplo, não pela pergunta.
              placeholder="Pergunte sobre os documentos…"
              style={{ maxHeight: MAX_COMPOSER_PX }}
              className="flex-1 resize-none self-center bg-transparent py-2 text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-[#9a9d98]"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              aria-label="Enviar pergunta"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-hover disabled:bg-navy-muted"
            >
              <ArrowUpIcon className="h-[1.125rem] w-[1.125rem]" />
            </button>
          </form>

          <p className="mt-2 text-center text-[0.6875rem] leading-snug text-muted">
            <span className="hidden sm:inline">
              <strong className="font-semibold text-ink">Enter</strong> envia,{' '}
              <strong className="font-semibold text-ink">Shift + Enter</strong> quebra a linha
              <span aria-hidden="true" className="mx-1.5">·</span>
            </span>
            Só documentos oficiais que o seu perfil pode consultar.
          </p>
        </div>
      </div>

      {/* Fora do fluxo (position: fixed), mas na raiz do componente para não
          herdar contexto de empilhamento de um pai com transform. */}
      <SourcePanel
        source={source?.citation ?? null}
        index={source?.index ?? null}
        onClose={() => setSource(null)}
      />
    </div>
  );
}
