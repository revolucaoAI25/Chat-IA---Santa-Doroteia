'use client';

import { useMemo, useState } from 'react';
import { DocumentIcon, FileIcon, SearchIcon } from '@/components/icons';
import {
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  SEGMENT_LABELS,
  serieLabel,
} from '@/lib/taxonomy';
import type { LibraryDocument } from '@/lib/documents';
import type { DocumentTypeValue, Role, Segment } from '@/lib/db/schema';

/** Sem acento e em minúsculas: "provas finais" acha "Provas Finais". */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Aceita tanto `YYYY-MM-DD` (data pura) quanto ISO com hora. */
function formatDate(iso: string): string {
  const value = iso.length === 10 ? `${iso}T00:00:00` : iso;
  return DATE_FORMAT.format(new Date(value)).replace('.', '');
}

/** Dias até o vencimento, ou null quando o documento não vence. */
function daysUntil(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${validUntil}T00:00:00`);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

export function DocumentsClient({
  documents,
  role,
}: {
  documents: LibraryDocument[];
  role: Role;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<DocumentTypeValue | 'todos'>('todos');

  // Só os tipos que existem no acervo: um filtro com treze opções, das quais
  // dez não devolvem nada, é ruído.
  const types = useMemo(() => {
    const present = new Set(documents.map((d) => d.type));
    return (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentTypeValue[]).filter((t) =>
      present.has(t),
    );
  }, [documents]);

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    return documents.filter((doc) => {
      if (type !== 'todos' && doc.type !== type) return false;
      if (!needle) return true;
      const haystack = fold(
        [doc.title, doc.summary ?? '', doc.etapa ?? '', doc.docNumber ?? ''].join(' '),
      );
      // Todas as palavras precisam aparecer, em qualquer ordem.
      return needle.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [documents, query, type]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[58rem] px-4 pb-16 pt-7 sm:px-6 lg:px-10 lg:pt-9">
        <p className="eyebrow">Acervo oficial</p>
        <h1 className="display mt-2 text-[1.875rem] sm:text-[2.125rem] lg:text-[2.5rem]">
          Documentos do colégio
        </h1>
        <p className="mt-3 max-w-[40rem] text-[0.9375rem] leading-relaxed text-muted">
          {role === 'aluno'
            ? 'Tudo o que está publicado para a sua série. São exatamente as fontes que o assistente usa para responder a você.'
            : 'Tudo o que está publicado para o seu acesso. São exatamente as fontes que o assistente usa nas respostas.'}
        </p>

        <div className="mt-7">
          <label className="sr-only" htmlFor="busca">
            Buscar documento
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="busca"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, assunto ou número…"
              className="field pl-10"
            />
          </div>
        </div>

        {types.length > 1 ? (
          <div
            className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filtrar por tipo"
          >
            <TypeChip active={type === 'todos'} onClick={() => setType('todos')}>
              Todos
            </TypeChip>
            {types.map((t) => (
              <TypeChip key={t} active={type === t} onClick={() => setType(t)}>
                {DOCUMENT_TYPE_LABELS[t]}
              </TypeChip>
            ))}
          </div>
        ) : null}

        <p className="mt-5 text-[0.8125rem] text-muted" aria-live="polite">
          {filtered.length === documents.length
            ? `${documents.length} documento${documents.length === 1 ? '' : 's'}`
            : `${filtered.length} de ${documents.length} documentos`}
        </p>

        {documents.length === 0 ? (
          <EmptyState
            title="Nenhum documento publicado ainda"
            body={
              role === 'admin' || role === 'coordenacao'
                ? 'Envie os primeiros arquivos em Administração → Ingestão. Assim que forem processados, aparecem aqui e passam a alimentar as respostas.'
                : 'Assim que a secretaria publicar os comunicados, eles aparecem aqui.'
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nada encontrado com esse filtro"
            body="Tente outra palavra, ou pergunte ao assistente — ele busca pelo conteúdo dos documentos, não só pelo título."
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {filtered.map((doc) => (
              <li key={doc.id}>
                <DocumentCard doc={doc} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DocumentCard({ doc }: { doc: LibraryDocument }) {
  const remaining = daysUntil(doc.validUntil);
  const scope = [
    ...doc.series.map(serieLabel),
    // O segmento só entra quando não há série: `serieLabel` já diz "7º ano ·
    // Fundamental II", e repetir o segmento embaixo seria a mesma informação.
    ...(doc.series.length === 0
      ? doc.segments.map((s) => SEGMENT_LABELS[s as Segment] ?? s)
      : []),
  ];

  return (
    <a
      href={`/api/documents/${doc.id}/file`}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex gap-3.5 p-4 transition-colors hover:border-navy/40 hover:bg-chip-soft sm:gap-4 sm:p-5"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip text-navy">
        <DocumentIcon className="h-[1.125rem] w-[1.125rem]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="eyebrow block">
          {DOCUMENT_TYPE_LABELS[doc.type] ?? 'Documento'}
          {doc.docNumber ? ` · Nº ${doc.docNumber}` : ''}
          {doc.etapa ? ` · ${doc.etapa}` : ''}
          {doc.anoLetivo ? ` · ${doc.anoLetivo}` : ''}
        </span>

        <span className="mt-1 block font-serif text-[1.125rem] leading-snug text-ink">
          {doc.title}
        </span>

        {doc.summary ? (
          <span className="mt-1.5 block text-[0.875rem] leading-relaxed text-muted">
            {doc.summary}
          </span>
        ) : null}

        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {scope.length > 0 ? (
            scope.map((label) => (
              <span key={label} className="chip">
                {label}
              </span>
            ))
          ) : (
            <span className="chip">Toda a escola</span>
          )}

          {doc.audience.length > 0
            ? doc.audience.map((a) => (
                <span key={a} className="chip bg-chip-soft">
                  {ROLE_LABELS[a as Role] ?? a}
                </span>
              ))
            : null}

          {remaining !== null && remaining <= 30 ? (
            <span className="chip bg-warning-soft text-warning">
              {remaining <= 0
                ? 'Vence hoje'
                : `Vigente por mais ${remaining} dia${remaining === 1 ? '' : 's'}`}
            </span>
          ) : null}

          <span className="text-[0.75rem] text-muted">
            {/* A data do cabeçalho identifica o comunicado; a de upload só diz
                quando a secretaria subiu o arquivo, e num acervo importado de
                uma vez é a mesma para tudo. */}
            {doc.documentDate
              ? `Documento de ${formatDate(doc.documentDate)}`
              : `Adicionado em ${formatDate(doc.createdAt)}`}
            {doc.pageCount ? ` · ${doc.pageCount} pág.` : ''}
          </span>
        </span>
      </span>

      <FileIcon className="h-4 w-4 shrink-0 text-navy opacity-40 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-line-strong bg-surface text-ink hover:bg-chip-soft'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel mt-4 p-7 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-chip text-navy">
        <DocumentIcon className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-[1rem] font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-[30rem] text-[0.875rem] leading-relaxed text-muted">
        {body}
      </p>
    </div>
  );
}
