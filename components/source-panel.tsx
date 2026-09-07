'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, DownloadIcon, FileIcon, XIcon } from './icons';
import { DOCUMENT_TYPE_LABELS, scopeLabel } from '@/lib/taxonomy';
import type { DocumentTypeValue } from '@/lib/db/schema';

export interface SourceDocument {
  documentId: string;
  title: string;
  type: string;
  docNumber: number | null;
  page: number | null;
  excerpt: string;
  anoLetivo?: number | null;
  etapa?: string | null;
  series?: string[];
  segments?: string[];
  validUntil?: string | null;
  mimeType?: string | null;
  excerpts?: Array<{ page: number | null; text: string }>;
}

/**
 * Gaveta com a fonte de uma afirmação da resposta.
 *
 * A citação numerada diz de onde veio; este painel deixa conferir sem sair da
 * conversa. É a diferença entre confiar e verificar — e como o compromisso do
 * sistema é responder só a partir dos documentos, tornar a conferência barata é
 * parte do produto, não um extra.
 *
 * Mostra os trechos que realmente foram ao prompt, em destaque, antes do PDF:
 * quem duvida da resposta quer ver a frase, não folhear o arquivo.
 */
export function SourcePanel({
  source,
  index,
  onClose,
}: {
  source: SourceDocument | null;
  /** Número da citação, para casar com a marca no texto. */
  index: number | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState(false);

  const open = source !== null;

  // Cada documento abre com a pré-visualização recolhida: carregar um PDF que a
  // pessoa talvez não queira ver gasta dados à toa, ainda mais no celular.
  useEffect(() => setPreview(false), [source?.documentId]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const fileUrl = source ? `/api/documents/${source.documentId}/file` : '';
  const isPdf = source?.mimeType === 'application/pdf';

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      inert={!open}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar fonte"
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Documento citado"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {source ? (
          <>
            <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
              <span className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-chip px-1.5 text-[0.75rem] font-bold text-navy">
                {index ?? <FileIcon className="h-4 w-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="eyebrow">
                  {DOCUMENT_TYPE_LABELS[source.type as DocumentTypeValue] ?? 'Documento'}
                  {source.docNumber ? ` · Nº ${source.docNumber}` : ''}
                </p>
                <h2 className="mt-1 font-serif text-[1.1875rem] leading-snug text-ink">
                  {source.title}
                </h2>
              </div>

              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-chip-soft hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <Metadata source={source} />

              <section className="mt-6">
                <p className="eyebrow-muted mb-2.5">
                  {(source.excerpts?.length ?? 1) === 1
                    ? 'Trecho usado na resposta'
                    : `${source.excerpts!.length} trechos usados na resposta`}
                </p>

                <div className="space-y-3">
                  {(source.excerpts ?? [{ page: source.page, text: source.excerpt }]).map(
                    (excerpt, i) => (
                      <blockquote
                        key={i}
                        className="rounded-lg border-l-[3px] border-navy/40 bg-panel px-4 py-3"
                      >
                        {excerpt.page ? (
                          <p className="eyebrow-muted mb-1.5">Página {excerpt.page}</p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink">
                          {excerpt.text}
                        </p>
                      </blockquote>
                    ),
                  )}
                </div>

                <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
                  É exatamente este texto que o assistente leu para responder. Se a resposta
                  divergir daqui, o problema está na redação — e vale marcar como não útil.
                </p>
              </section>

              <section className="mt-7">
                <p className="eyebrow-muted mb-2.5">Documento original</p>

                {isPdf && preview ? (
                  <iframe
                    src={fileUrl}
                    title={`Pré-visualização de ${source.title}`}
                    className="h-[26rem] w-full rounded-lg border border-line bg-panel"
                  />
                ) : isPdf ? (
                  <button
                    type="button"
                    onClick={() => setPreview(true)}
                    className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-navy/40 hover:bg-chip-soft"
                  >
                    <FileIcon className="h-5 w-5 shrink-0 text-navy" />
                    <span className="text-[0.875rem] font-semibold text-ink">
                      Ver o PDF aqui mesmo
                    </span>
                  </button>
                ) : (
                  <p className="flex items-start gap-2.5 rounded-lg bg-chip-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
                    <span>
                      Este documento não é um PDF, então não dá para pré-visualizar aqui. Use os
                      botões abaixo para abrir ou baixar o arquivo original.
                    </span>
                  </p>
                )}
              </section>
            </div>

            <footer className="flex shrink-0 flex-wrap gap-2 border-t border-line px-5 py-4 sm:px-6">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost flex-1 justify-center"
              >
                <FileIcon className="h-4 w-4" />
                {/* No celular o rótulo longo quebra em duas linhas e desalinha
                    os dois botões. */}
                <span className="sm:hidden">Abrir</span>
                <span className="hidden sm:inline">Abrir em nova aba</span>
              </a>
              <a href={`${fileUrl}?download=1`} className="btn-primary flex-1 justify-center">
                <DownloadIcon className="h-4 w-4" />
                Baixar
              </a>
            </footer>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Metadata({ source }: { source: SourceDocument }) {
  const linhas: Array<[string, string]> = [
    ['Vale para', scopeLabel(source.series, source.segments)],
  ];
  if (source.anoLetivo) linhas.push(['Ano letivo', String(source.anoLetivo)]);
  if (source.etapa) linhas.push(['Etapa', source.etapa]);
  if (source.validUntil) linhas.push(['Vigente até', formatDate(source.validUntil)]);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.8125rem]">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-muted">{rotulo}</dt>
          <dd className="font-medium text-ink">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatDate(iso: string): string {
  // A data vem como YYYY-MM-DD; o `T00:00:00` evita o recuo de um dia que o
  // parser aplica quando interpreta a string como UTC.
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  );
}
