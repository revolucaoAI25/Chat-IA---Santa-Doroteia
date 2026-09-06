'use client';

import { useActionState, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { ROLE_LABELS, SEGMENTS, SEGMENT_LABELS, SERIES, segmentLabel, serieLabel } from '@/lib/taxonomy';
import { updateProfile, type ProfileState } from '@/app/actions/profile';
import type { SessionUser } from '@/lib/auth/session';

const DISCIPLINAS = [
  'Português', 'Matemática', 'Ciências', 'História', 'Geografia', 'Inglês',
  'Física', 'Química', 'Biologia', 'Arte', 'Educação Física', 'Filosofia',
  'Sociologia', 'Ensino Religioso', 'Redação',
];

export function ProfileForm({ user }: { user: SessionUser }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const isTeacher = user.role !== 'aluno';

  const [disciplinas, setDisciplinas] = useState<string[]>(user.disciplinas);
  const [segmentsTaught, setSegmentsTaught] = useState<string[]>(user.segmentsTaught);
  const [extraSeries, setExtraSeries] = useState<string[]>(user.extraSeries);

  const toggle = (
    value: string,
    list: string[],
    setList: (next: string[]) => void,
  ) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[46rem] px-10 pb-16 pt-9">
        <p className="eyebrow">Contexto do assistente</p>
        <h1 className="display mt-2 text-[2.5rem]">Como a IA fala com você</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          Estas informações entram na conversa toda vez que você pergunta algo. Quanto mais
          preciso o contexto, menos o assistente precisa perguntar de volta.
        </p>

        {/* Identidade — vem da secretaria e não é editável aqui. */}
        <section className="panel mt-8 p-6">
          <p className="eyebrow-muted">Cadastro institucional</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nome" value={user.name} />
            <Field label="Matrícula" value={user.matricula} />
            <Field label="Perfil" value={ROLE_LABELS[user.role]} />
            <Field label="E-mail" value={user.email} />
            {user.role === 'aluno' ? (
              <>
                <Field label="Série" value={serieLabel(user.serie)} />
                <Field label="Turma" value={user.turma ?? '—'} />
                <Field label="Segmento" value={segmentLabel(user.segment)} />
              </>
            ) : null}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
            {user.role === 'aluno'
              ? 'Série e turma definem quais documentos você enxerga, por isso só a secretaria pode alterá-las. Se algo estiver errado aqui, fale com a secretaria.'
              : 'Nome, matrícula e perfil são mantidos pela secretaria.'}
          </p>
        </section>

        <form action={formAction} className="mt-6 space-y-6">
          {isTeacher ? (
            <>
              <section className="panel p-6">
                <p className="eyebrow-muted">Disciplinas que você leciona</p>
                <p className="mt-1.5 text-[0.8125rem] text-muted">
                  O assistente prioriza o que é da sua matéria quando a pergunta for genérica.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {DISCIPLINAS.map((disciplina) => (
                    <Toggle
                      key={disciplina}
                      label={disciplina}
                      active={disciplinas.includes(disciplina)}
                      onClick={() => toggle(disciplina, disciplinas, setDisciplinas)}
                    />
                  ))}
                </div>
                {disciplinas.map((d) => (
                  <input key={d} type="hidden" name="disciplinas" value={d} />
                ))}
              </section>

              <section className="panel p-6">
                <p className="eyebrow-muted">Segmentos em que você dá aula</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SEGMENTS.map((seg) => (
                    <Toggle
                      key={seg}
                      label={SEGMENT_LABELS[seg]}
                      active={segmentsTaught.includes(seg)}
                      onClick={() => toggle(seg, segmentsTaught, setSegmentsTaught)}
                    />
                  ))}
                </div>
                {segmentsTaught.map((s) => (
                  <input key={s} type="hidden" name="segmentsTaught" value={s} />
                ))}
              </section>

              <section className="panel p-6">
                <p className="eyebrow-muted">Séries que você acompanha</p>
                <p className="mt-1.5 text-[0.8125rem] text-muted">
                  Você já enxerga todas as séries. Marcar aqui só diz ao assistente quais
                  interessam mais quando a resposta variar por série.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SERIES.map((serie) => (
                    <Toggle
                      key={serie.value}
                      label={serie.label}
                      active={extraSeries.includes(serie.value)}
                      onClick={() => toggle(serie.value, extraSeries, setExtraSeries)}
                    />
                  ))}
                </div>
                {extraSeries.map((s) => (
                  <input key={s} type="hidden" name="extraSeries" value={s} />
                ))}
              </section>
            </>
          ) : null}

          <section className="panel p-6">
            <label className="field-label" htmlFor="contextNote">
              Alguma coisa que o assistente deveria saber
            </label>
            <textarea
              id="contextNote"
              name="contextNote"
              rows={3}
              maxLength={400}
              defaultValue={user.contextNote ?? ''}
              placeholder={
                user.role === 'aluno'
                  ? 'Ex.: também acompanho meu irmão do 9º ano; prefiro respostas bem diretas.'
                  : 'Ex.: sou regente do 7A e coordeno o projeto de leitura.'
              }
              className="field resize-none"
            />
            <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
              Até 400 caracteres. Isso ajusta o tom e o foco das respostas, mas{' '}
              <strong className="font-semibold text-ink">não muda</strong> quais documentos você
              pode ver — o acesso continua vindo do seu cadastro.
            </p>
          </section>

          <div className="flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar contexto'}
            </button>
            {state.saved ? (
              <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-success">
                <CheckIcon className="h-4 w-4" />
                Contexto atualizado.
              </p>
            ) : null}
            {state.error ? (
              <p className="text-[0.875rem] font-medium text-danger">{state.error}</p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow-muted">{label}</dt>
      <dd className="mt-1 text-[0.9375rem] text-ink">{value}</dd>
    </div>
  );
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
      className={`rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-line-strong bg-surface text-ink hover:bg-chip-soft'
      }`}
    >
      {label}
    </button>
  );
}
