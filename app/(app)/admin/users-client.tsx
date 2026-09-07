'use client';

import { useActionState, useState, useTransition } from 'react';
import { AlertIcon, CheckIcon } from '@/components/icons';
import { ROLE_LABELS, SEGMENTS, SEGMENT_LABELS, SERIES, serieLabel } from '@/lib/taxonomy';
import { updateUserContext, toggleUserActive, type UserState } from '@/app/actions/users';
import type { Role, Segment } from '@/lib/db/schema';

const DISCIPLINAS = [
  'Português', 'Matemática', 'Ciências', 'História', 'Geografia', 'Inglês',
  'Física', 'Química', 'Biologia', 'Arte', 'Educação Física', 'Filosofia',
  'Sociologia', 'Ensino Religioso', 'Redação',
];

export interface AdminUser {
  id: string;
  name: string;
  matricula: string;
  email: string;
  role: Role;
  serie: string | null;
  serieVigente: string | null;
  serieAnoLetivo: number | null;
  turma: string | null;
  segment: Segment | null;
  extraSeries: string[];
  disciplinas: string[];
  seriesTaught: string[];
  segmentsTaught: Segment[];
  active: boolean;
  concluido: boolean;
  lastSeenAt: string | null;
}

export function UsersClient({ users, anoLetivo }: { users: AdminUser[]; anoLetivo: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<UserState, FormData>(updateUserContext, {});

  return (
    <div>
      <p className="eyebrow">Base de acesso</p>
      <h1 className="display mt-2 text-[2.5rem]">Quem entra no sistema</h1>
      <p className="mt-3 max-w-[42rem] text-[0.9375rem] leading-relaxed text-muted">
        A matrícula é o login. O papel e a série definem quais documentos a pessoa vê — e o que a
        IA pode usar para responder a ela. Só esta tela altera esse contexto: nem aluno nem
        professor editam o próprio cadastro.
      </p>

      <p className="mt-5 flex items-start gap-2.5 rounded-lg bg-chip-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
        <span>
          A série é registrada junto com o ano letivo e <strong>avança sozinha</strong> na virada
          do ano. Quem foi cadastrado no 7º ano em {anoLetivo - 1} é tratado como 8º ano em{' '}
          {anoLetivo}. Só mexa aqui em caso de correção ou retenção.
        </span>
      </p>

      <div className="mt-8 space-y-3">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            anoLetivo={anoLetivo}
            open={editing === user.id}
            saved={state.saved === user.id && !pending}
            pending={pending && editing === user.id}
            onToggle={() => setEditing(editing === user.id ? null : user.id)}
            formAction={formAction}
          />
        ))}
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 text-[0.875rem] font-medium text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function UserRow({
  user,
  anoLetivo,
  open,
  saved,
  pending,
  onToggle,
  formAction,
}: {
  user: AdminUser;
  anoLetivo: number;
  open: boolean;
  saved: boolean;
  pending: boolean;
  onToggle: () => void;
  formAction: (formData: FormData) => void;
}) {
  const [busy, startTransition] = useTransition();
  const isStudent = user.role === 'aluno';

  const [serie, setSerie] = useState(user.serie ?? '');
  const [turma, setTurma] = useState(user.turma ?? '');
  const [disciplinas, setDisciplinas] = useState(user.disciplinas);
  const [seriesTaught, setSeriesTaught] = useState(user.seriesTaught);
  const [segmentsTaught, setSegmentsTaught] = useState<string[]>(user.segmentsTaught);

  const toggle = (value: string, list: string[], set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className={`card ${user.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.9375rem] font-semibold text-ink">{user.name}</span>
            <span className="chip">{ROLE_LABELS[user.role]}</span>
            {!user.active ? (
              <span className="chip bg-danger-soft text-danger">Desativado</span>
            ) : null}
            {user.concluido ? (
              <span className="chip bg-warning-soft text-warning">Concluiu o EM</span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.75rem] text-muted">
            {user.matricula} · {user.email}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-muted">{summary(user)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1 text-[0.75rem] font-semibold text-success">
              <CheckIcon className="h-3.5 w-3.5" />
              Salvo
            </span>
          ) : null}
          <button type="button" onClick={onToggle} className="btn-ghost px-4 py-1.5 text-[0.8125rem]">
            {open ? 'Fechar' : 'Editar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startTransition(() => void toggleUserActive(user.id, !user.active).catch(() => {}))
            }
            className="rounded-full border border-line-strong px-4 py-1.5 text-[0.8125rem] font-semibold text-muted transition-colors hover:bg-chip-soft disabled:opacity-50"
          >
            {user.active ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      </div>

      {open ? (
        <form action={formAction} className="border-t border-line bg-panel p-5">
          <input type="hidden" name="userId" value={user.id} />

          {isStudent ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`serie-${user.id}`}>
                    Série cadastrada
                  </label>
                  <select
                    id={`serie-${user.id}`}
                    name="serie"
                    value={serie}
                    onChange={(event) => setSerie(event.target.value)}
                    className="field"
                  >
                    <option value="">Sem série</option>
                    {SERIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[0.75rem] leading-snug text-muted">
                    Será registrada como válida para o ano letivo de {anoLetivo}.
                    {user.serieAnoLetivo && user.serieAnoLetivo !== anoLetivo ? (
                      <>
                        {' '}
                        Hoje está como <strong>{serieLabel(user.serieVigente)}</strong>, avançada
                        automaticamente desde {user.serieAnoLetivo}.
                      </>
                    ) : null}
                  </p>
                </div>

                <div>
                  <label className="field-label" htmlFor={`turma-${user.id}`}>
                    Turma
                  </label>
                  <input
                    id={`turma-${user.id}`}
                    name="turma"
                    value={turma}
                    onChange={(event) => setTurma(event.target.value)}
                    maxLength={10}
                    placeholder="7A"
                    className="field"
                  />
                </div>
              </div>

              <div>
                <p className="field-label">Séries adicionais que este acesso acompanha</p>
                <p className="mb-2 text-[0.75rem] leading-snug text-muted">
                  Para responsáveis com mais de um filho. <strong>Amplia o acesso</strong> aos
                  documentos dessas séries.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SERIES.map((s) => (
                    <Pill
                      key={s.value}
                      name="extraSeries"
                      value={s.value}
                      label={s.label}
                      defaultChecked={user.extraSeries.includes(s.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="field-label">Disciplinas</p>
                <div className="flex flex-wrap gap-2">
                  {DISCIPLINAS.map((d) => (
                    <Toggle
                      key={d}
                      label={d}
                      active={disciplinas.includes(d)}
                      onClick={() => toggle(d, disciplinas, setDisciplinas)}
                    />
                  ))}
                </div>
                {disciplinas.map((d) => (
                  <input key={d} type="hidden" name="disciplinas" value={d} />
                ))}
                <p className="mt-2 text-[0.75rem] leading-snug text-muted">
                  Deixe vazio para professor polivalente (Fundamental I, por exemplo).
                </p>
              </div>

              <div>
                <p className="field-label">Séries em que dá aula</p>
                <div className="flex flex-wrap gap-2">
                  {SERIES.map((s) => (
                    <Toggle
                      key={s.value}
                      label={s.label}
                      active={seriesTaught.includes(s.value)}
                      onClick={() => toggle(s.value, seriesTaught, setSeriesTaught)}
                    />
                  ))}
                </div>
                {seriesTaught.map((s) => (
                  <input key={s} type="hidden" name="seriesTaught" value={s} />
                ))}
              </div>

              <div>
                <p className="field-label">Segmentos</p>
                <div className="flex flex-wrap gap-2">
                  {SEGMENTS.map((s) => (
                    <Toggle
                      key={s}
                      label={SEGMENT_LABELS[s]}
                      active={segmentsTaught.includes(s)}
                      onClick={() => toggle(s, segmentsTaught, setSegmentsTaught)}
                    />
                  ))}
                </div>
                {segmentsTaught.map((s) => (
                  <input key={s} type="hidden" name="segmentsTaught" value={s} />
                ))}
              </div>

              <p className="text-[0.75rem] leading-relaxed text-muted">
                Este contexto ajusta como a IA fala com o professor. Não altera o acesso: professor
                já enxerga todas as séries.
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary mt-6" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar cadastro'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function summary(user: AdminUser): string {
  if (user.role === 'aluno') {
    // `serieLabel` já traz o segmento ("7º ano · Fundamental II"), então
    // acrescentá-lo de novo duplicaria a informação na linha.
    return [
      serieLabel(user.serieVigente),
      user.turma ? `Turma ${user.turma}` : null,
      user.extraSeries.length ? `+${user.extraSeries.length} série(s) acompanhada(s)` : null,
    ]
      .filter((v) => v && v !== '—')
      .join(' · ');
  }

  return [
    user.disciplinas.length ? user.disciplinas.join(', ') : 'Polivalente (sem disciplina definida)',
    user.seriesTaught.length
      ? `${user.seriesTaught.length} série${user.seriesTaught.length === 1 ? '' : 's'}`
      : 'Nenhuma série definida',
  ].join(' · ');
}

function Toggle({
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

/** Caixa de seleção real, para o formulário enviar sem estado no cliente. */
function Pill({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="inline-block rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.75rem] font-semibold text-ink transition-colors hover:bg-chip-soft peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white">
        {label}
      </span>
    </label>
  );
}
