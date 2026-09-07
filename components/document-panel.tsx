'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { AlertIcon, CheckIcon, XIcon } from '@/components/icons';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  SEGMENTS,
  SEGMENT_LABELS,
  SERIES,
} from '@/lib/taxonomy';
import {
  deleteDocument,
  updateDocument,
  type DocumentState,
} from '@/app/actions/documents';
import type { DocumentTypeValue, Role, Segment } from '@/lib/db/schema';

export interface EditableDocument {
  id: string;
  title: string;
  summary: string | null;
  type: DocumentTypeValue;
  docNumber: number | null;
  segments: Segment[];
  series: string[];
  restrictToScope: boolean;
  anoLetivo: number | null;
  etapa: string | null;
  documentDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
  audience: Role[];
}

const AUDIENCES: Role[] = ['aluno', 'professor', 'coordenacao'];
const ETAPAS = ['1ª etapa', '2ª etapa', '3ª etapa', '4ª etapa', 'Anual'];

/**
 * Correção de um documento já ingerido.
 *
 * Existe porque a classificação automática é uma aposta razoável, não um
 * veredito: a data lida do cabeçalho errado, o público-alvo trocado, o título
 * que veio do nome do arquivo. Sem esta tela, corrigir exigiria reenviar o
 * arquivo — que o pipeline recusa por duplicidade de checksum — ou mexer no
 * banco à mão.
 *
 * Em gaveta, e não expandindo o cartão, porque a lista é uma grade de duas
 * colunas: um formulário deste tamanho aberto dentro de um cartão empurraria
 * todo o resto da grade.
 */
export function DocumentPanel({
  document: doc,
  onClose,
}: {
  document: EditableDocument | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    updateDocument,
    {},
  );

  const [segments, setSegments] = useState<Segment[]>([]);
  const [series, setSeries] = useState<string[]>([]);
  const [audience, setAudience] = useState<Role[]>([]);
  const [restrict, setRestrict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, startRemoval] = useTransition();

  const open = doc !== null;

  // Trocar de documento recarrega o formulário e cancela uma exclusão que
  // estivesse à espera de confirmação.
  useEffect(() => {
    if (!doc) return;
    setSegments(doc.segments);
    setSeries(doc.series);
    setAudience(doc.audience);
    setRestrict(doc.restrictToScope);
    setConfirming(false);
  }, [doc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = <T extends string>(value: T, list: T[], set: (next: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      inert={!open}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar edição"
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Editar documento"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[38rem] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {doc ? (
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="documentId" value={doc.id} />

            <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Editar documento</p>
                <p className="mt-1 truncate font-serif text-[1.125rem] text-ink">{doc.title}</p>
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

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <section>
                <p className="eyebrow-muted mb-3">Identificação</p>

                <label className="field-label" htmlFor="ed-title">
                  Título
                </label>
                <input
                  id="ed-title"
                  name="title"
                  defaultValue={doc.title}
                  required
                  maxLength={200}
                  className="field"
                />

                <label className="field-label mt-4" htmlFor="ed-summary">
                  Resumo
                </label>
                <textarea
                  id="ed-summary"
                  name="summary"
                  defaultValue={doc.summary ?? ''}
                  rows={2}
                  maxLength={500}
                  className="field resize-none"
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="ed-type">
                      Tipo
                    </label>
                    <select id="ed-type" name="type" defaultValue={doc.type} className="field">
                      {DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOCUMENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ed-number">
                      Nº do comunicado
                    </label>
                    <input
                      id="ed-number"
                      name="docNumber"
                      type="number"
                      min={0}
                      defaultValue={doc.docNumber ?? ''}
                      className="field"
                    />
                  </div>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <p className="eyebrow-muted mb-1">Datas</p>
                <p className="mb-3 text-[0.75rem] leading-relaxed text-muted">
                  A <strong className="text-ink">data do documento</strong> é a do cabeçalho, e só
                  identifica o comunicado. As datas de provas e eventos ficam no calendário e vêm
                  do corpo do texto — não se mexe nelas por aqui.
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="field-label" htmlFor="ed-doc-date">
                      Data do documento
                    </label>
                    <input
                      id="ed-doc-date"
                      name="documentDate"
                      type="date"
                      defaultValue={doc.documentDate ?? ''}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ed-from">
                      Publicar a partir de
                    </label>
                    <input
                      id="ed-from"
                      name="validFrom"
                      type="date"
                      defaultValue={doc.validFrom ?? ''}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ed-until">
                      Vigência até
                    </label>
                    <input
                      id="ed-until"
                      name="validUntil"
                      type="date"
                      defaultValue={doc.validUntil ?? ''}
                      className="field"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="ed-ano">
                      Ano letivo
                    </label>
                    <input
                      id="ed-ano"
                      name="anoLetivo"
                      type="number"
                      min={2000}
                      max={2100}
                      defaultValue={doc.anoLetivo ?? ''}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ed-etapa">
                      Etapa
                    </label>
                    <select
                      id="ed-etapa"
                      name="etapa"
                      defaultValue={doc.etapa ?? ''}
                      className="field"
                    >
                      <option value="">Sem etapa</option>
                      {ETAPAS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <p className="eyebrow-muted mb-1">Quem pode ver</p>
                <p className="mb-3 text-[0.75rem] leading-relaxed text-muted">
                  Nada marcado: toda a escola. Este é o campo que{' '}
                  <strong className="text-ink">de fato esconde</strong>.
                </p>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCES.map((role) => (
                    <Pill
                      key={role}
                      label={ROLE_LABELS[role]}
                      active={audience.includes(role)}
                      onClick={() => toggle(role, audience, setAudience)}
                    />
                  ))}
                </div>
                {audience.map((r) => (
                  <input key={r} type="hidden" name="audience" value={r} />
                ))}
              </section>

              <section className="border-t border-line pt-5">
                <p className="eyebrow-muted mb-1">Série e segmento</p>
                <p className="mb-3 text-[0.75rem] leading-relaxed text-muted">
                  Classificam o documento e ajudam a busca a priorizá-lo. Por si só{' '}
                  <strong className="text-ink">não escondem</strong> nada.
                </p>

                <div className="flex flex-wrap gap-2">
                  {SEGMENTS.map((s) => (
                    <Pill
                      key={s}
                      label={SEGMENT_LABELS[s]}
                      active={segments.includes(s)}
                      onClick={() => toggle(s, segments, setSegments)}
                    />
                  ))}
                </div>
                {segments.map((s) => (
                  <input key={s} type="hidden" name="segments" value={s} />
                ))}

                <div className="mt-3 flex flex-wrap gap-2">
                  {SERIES.map((s) => (
                    <Pill
                      key={s.value}
                      label={s.label}
                      active={series.includes(s.value)}
                      onClick={() => toggle(s.value, series, setSeries)}
                    />
                  ))}
                </div>
                {series.map((s) => (
                  <input key={s} type="hidden" name="series" value={s} />
                ))}

                {segments.length > 0 || series.length > 0 ? (
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={restrict}
                      onChange={(event) => setRestrict(event.target.checked)}
                      className="mt-0.5 accent-navy"
                    />
                    <span className="text-[0.8125rem] leading-snug text-ink">
                      Exibir somente para essas séries e segmentos
                      <span className="mt-0.5 block text-[0.75rem] text-muted">
                        Alunos de outras séries deixam de ver este documento. Professores e
                        coordenação continuam vendo.
                      </span>
                    </span>
                  </label>
                ) : null}
                {restrict && (segments.length > 0 || series.length > 0) ? (
                  <input type="hidden" name="restrictToScope" value="true" />
                ) : null}
              </section>

              <section className="border-t border-line pt-5">
                <p className="eyebrow-muted mb-3">Excluir</p>

                {confirming ? (
                  <div className="rounded-lg bg-danger-soft p-4">
                    <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-danger">
                      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Apaga o documento, os trechos indexados, as datas extraídas e o arquivo
                        original. <strong>Não tem como desfazer</strong> — só reenviando o arquivo.
                      </span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() =>
                          startRemoval(async () => {
                            await deleteDocument(doc.id);
                            onClose();
                          })
                        }
                        className="rounded-full bg-danger px-5 py-2 text-[0.8125rem] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {removing ? 'Excluindo…' : 'Sim, excluir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="rounded-full border border-line-strong bg-surface px-5 py-2 text-[0.8125rem] font-semibold text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="rounded-full border border-danger/40 px-5 py-2 text-[0.8125rem] font-semibold text-danger transition-colors hover:bg-danger-soft"
                  >
                    Excluir este documento
                  </button>
                )}
              </section>
            </div>

            <footer className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-4 sm:px-6">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar alterações'}
              </button>

              {state.error ? (
                <p role="alert" className="text-[0.8125rem] font-medium text-danger">
                  {state.error}
                </p>
              ) : state.saved === doc.id && !pending ? (
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-success">
                  <CheckIcon className="h-4 w-4" />
                  Salvo
                </p>
              ) : null}
            </footer>
          </form>
        ) : null}
      </aside>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-line-strong bg-surface text-ink hover:bg-chip-soft'
      }`}
    >
      {label}
    </button>
  );
}
