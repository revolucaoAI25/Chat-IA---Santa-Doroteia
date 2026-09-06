'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerText } from '@/components/answer-text';
import { AlertIcon, ArrowUpIcon, ArrowUpRightIcon, FileIcon, SparkleIcon } from '@/components/icons';
import { DOCUMENT_TYPE_LABELS, ROLE_LABELS, serieLabel } from '@/lib/taxonomy';
import type { SessionUser } from '@/lib/auth/session';
import type { DocumentTypeValue } from '@/lib/db/schema';

interface Citation {
  documentId: string;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  excerpt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Verdadeiro entre o envio e o primeiro token da resposta. */
  pending?: boolean;
  error?: string;
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
  const [conversationId, setConversationId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const citationRefs = useRef(new Map<string, HTMLAnchorElement | null>());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items]);

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
              setConversationId(event.conversationId);
            } else if (event.type === 'delta') {
              answer += event.text;
              patch({ content: answer, pending: false });
            } else if (event.type === 'done') {
              patch({ citations: event.citations, pending: false });
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
    setInput('');
    textareaRef.current?.focus();
  };

  const focusCitation = (messageId: string, index: number) => {
    const element = citationRefs.current.get(`${messageId}:${index}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  };

  const empty = items.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[52rem] px-10 pb-10 pt-9">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">Chat fundamentado</p>
              <h1 className="display mt-2 text-[2.5rem]">Pergunte sobre os documentos oficiais</h1>
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

          {/* Torna visível o que a IA sabe sobre quem pergunta. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.75rem] text-muted">
            <span className="eyebrow-muted">Falando com a IA como</span>
            <span className="chip">{ROLE_LABELS[user.role]}</span>
            {user.serie ? <span className="chip">{serieLabel(user.serie)}</span> : null}
            {user.turma ? <span className="chip">Turma {user.turma}</span> : null}
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
                    <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-[#B58A1B]">
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
                        onCitationClick={(index) => focusCitation(item.id, index)}
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

                    {item.citations.length > 0 ? (
                      <section className="mt-5">
                        <p className="eyebrow-muted mb-2.5">
                          {item.citations.length === 1
                            ? 'Documento consultado'
                            : `${item.citations.length} documentos consultados`}
                        </p>
                        <ul className="space-y-2">
                          {item.citations.map((citation, index) => (
                            <li key={citation.documentId}>
                              <a
                                ref={(node) => {
                                  citationRefs.current.set(`${item.id}:${index + 1}`, node);
                                }}
                                href={`/api/documents/${citation.documentId}/file`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="card group flex gap-3 p-3.5 transition-colors hover:border-navy/40 hover:bg-chip-soft"
                              >
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-chip text-[0.6875rem] font-bold text-navy">
                                  {index + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="eyebrow block">
                                    {DOCUMENT_TYPE_LABELS[citation.type as DocumentTypeValue] ??
                                      'Documento'}
                                    {citation.docNumber ? ` · Nº ${citation.docNumber}` : ''}
                                    {citation.page ? ` · pág. ${citation.page}` : ''}
                                  </span>
                                  <span className="mt-1 block font-serif text-[1.0625rem] leading-snug text-ink">
                                    {citation.title}
                                  </span>
                                  <span className="mt-1.5 block text-[0.8125rem] leading-snug text-muted">
                                    {citation.excerpt}…
                                  </span>
                                </span>
                                <FileIcon className="h-4 w-4 shrink-0 text-navy opacity-40 transition-opacity group-hover:opacity-100" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </article>
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-header/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[52rem] px-10 py-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="card p-4 focus-within:border-navy/50 focus-within:shadow-[0_0_0_3px_rgb(15_59_133_/_0.10)]"
          >
            <label className="field-label" htmlFor="question">
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
              rows={2}
              maxLength={2000}
              placeholder="Pergunte sobre provas, comunicados, eventos…"
              className="w-full resize-none bg-transparent text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-[#9a9d98]"
            />
            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-[0.75rem] text-muted">
                <strong className="font-semibold text-ink">Enter</strong> para enviar{' '}
                <span className="mx-1.5 text-line-strong">·</span>
                <strong className="font-semibold text-ink">Shift + Enter</strong> para nova linha
              </p>
              <button
                type="submit"
                disabled={busy || input.trim().length === 0}
                aria-label="Enviar pergunta"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-hover disabled:bg-navy-muted"
              >
                <ArrowUpIcon className="h-5 w-5" />
              </button>
            </div>
          </form>

          <p className="mt-2.5 text-center text-[0.75rem] text-muted">
            As respostas usam apenas os documentos oficiais que o seu perfil pode consultar.
          </p>
        </div>
      </div>
    </div>
  );
}
