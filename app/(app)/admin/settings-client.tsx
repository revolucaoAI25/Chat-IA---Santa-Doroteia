'use client';

import { useActionState, useState } from 'react';
import { AlertIcon, CheckIcon } from '@/components/icons';
import { saveSettings, type SettingsState } from '@/app/actions/settings';
import {
  DEFAULT_ETAPA_ENDS,
  DEFAULT_TIMEZONE,
  DEFAULT_YEAR_START,
  TIMEZONES,
} from '@/lib/academic-calendar';
import type { TenantSettings } from '@/lib/db/schema';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "05-15" → "15 de maio" */
function humanize(monthDay: string): string {
  const [month, day] = monthDay.split('-').map(Number);
  if (!month || !day || month > 12) return '—';
  return `${day} de ${MESES[month - 1]}`;
}

/** Campo MM-DD apresentado como dois seletores, para não depender de digitação. */
function MonthDayField({
  name,
  label,
  value,
  onChange,
  help,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  help?: string;
}) {
  const [month, day] = value.split('-');

  const daysInMonth = new Date(2024, Number(month), 0).getDate();

  return (
    <div>
      <label className="field-label" htmlFor={`${name}-month`}>
        {label}
      </label>
      <div className="flex gap-2">
        <select
          id={`${name}-month`}
          value={month}
          onChange={(event) => {
            const nextMonth = event.target.value;
            const max = new Date(2024, Number(nextMonth), 0).getDate();
            const safeDay = Math.min(Number(day), max);
            onChange(`${nextMonth}-${String(safeDay).padStart(2, '0')}`);
          }}
          className="field flex-1"
        >
          {MESES.map((nome, index) => (
            <option key={nome} value={String(index + 1).padStart(2, '0')}>
              {nome}
            </option>
          ))}
        </select>
        <select
          aria-label={`Dia — ${label}`}
          value={day}
          onChange={(event) => onChange(`${month}-${event.target.value}`)}
          className="field w-24"
        >
          {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name={name} value={value} />
      {help ? <p className="mt-1.5 text-[0.75rem] leading-snug text-muted">{help}</p> : null}
    </div>
  );
}

export function SettingsClient({ settings }: { settings: TenantSettings }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSettings, {});

  const [yearStart, setYearStart] = useState(settings.yearStart ?? DEFAULT_YEAR_START);
  const [ends, setEnds] = useState<[string, string, string]>(
    settings.etapaEnds ?? DEFAULT_ETAPA_ENDS,
  );
  const [timezone, setTimezone] = useState(settings.timezone ?? DEFAULT_TIMEZONE);
  const [context, setContext] = useState(settings.institutionalContext ?? '');

  const setEnd = (index: number, value: string) =>
    setEnds((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });

  const ordered = yearStart < ends[0] && ends[0] < ends[1] && ends[1] < ends[2];

  return (
    <div>
      <p className="eyebrow">Configurações do colégio</p>
      <h1 className="display mt-2 text-[1.875rem] sm:text-[2.125rem] lg:text-[2.5rem]">O que a IA sabe sobre a escola</h1>
      <p className="mt-3 max-w-[42rem] text-[0.9375rem] leading-relaxed text-muted">
        O calendário letivo e as informações gerais abaixo entram no contexto de toda resposta.
        São o que permite ao assistente entender “a próxima prova” ou “esta etapa” sem precisar
        perguntar.
      </p>

      <form action={formAction} className="mt-8 space-y-6">
        <section className="panel p-4 sm:p-6">
          <p className="eyebrow-muted">Ano letivo e etapas</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            O ano é dividido em três etapas. Estas datas definem qual etapa o assistente considera
            vigente — corrija-as com o calendário oficial da secretaria.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <MonthDayField
              name="yearStart"
              label="Início do ano letivo"
              value={yearStart}
              onChange={setYearStart}
            />
            <MonthDayField
              name="etapaEnd0"
              label="Fim da 1ª etapa"
              value={ends[0]}
              onChange={(v) => setEnd(0, v)}
            />
            <MonthDayField
              name="etapaEnd1"
              label="Fim da 2ª etapa"
              value={ends[1]}
              onChange={(v) => setEnd(1, v)}
            />
            <MonthDayField
              name="etapaEnd2"
              label="Fim da 3ª etapa"
              value={ends[2]}
              onChange={(v) => setEnd(2, v)}
            />
          </div>

          <div className="mt-5 rounded-lg bg-chip-soft p-4">
            <p className="eyebrow-muted mb-2">Como fica o ano</p>
            <ol className="space-y-1 text-[0.8125rem] text-ink">
              <li>
                <strong>1ª etapa</strong> — de {humanize(yearStart)} a {humanize(ends[0])}
              </li>
              <li>
                <strong>2ª etapa</strong> — de {humanize(ends[0])} a {humanize(ends[1])}
              </li>
              <li>
                <strong>3ª etapa</strong> — de {humanize(ends[1])} a {humanize(ends[2])}
              </li>
            </ol>
            {!ordered ? (
              <p className="mt-3 flex items-start gap-2 text-[0.8125rem] font-medium text-danger">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                As datas precisam estar em ordem crescente. Do jeito que estão, uma das etapas
                ficaria vazia.
              </p>
            ) : null}
          </div>

          <div className="mt-5 max-w-xs">
            <label className="field-label" htmlFor="timezone">
              Fuso horário
            </label>
            <select
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="field"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('America/', '').replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.75rem] leading-snug text-muted">
              O servidor roda em UTC. Sem o fuso certo, uma prova das 7h10 poderia ser tratada
              como sendo de outro dia.
            </p>
          </div>
        </section>

        <section className="panel p-4 sm:p-6">
          <label className="field-label" htmlFor="institutionalContext">
            Informações gerais sobre o colégio
          </label>
          <p className="mb-3 text-[0.8125rem] leading-relaxed text-muted">
            O que a IA deve saber e não está em nenhum documento: horários de funcionamento,
            unidades, canais de atendimento, nomenclatura interna. Vale como apoio — se um
            documento oficial disser outra coisa, o documento prevalece.
          </p>
          <textarea
            id="institutionalContext"
            name="institutionalContext"
            rows={8}
            maxLength={2000}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder={`Ex.:
A secretaria atende de segunda a sexta, das 7h às 17h, pelo telefone (31) 0000-0000.
As aulas do Fundamental I começam às 7h20 e as do Fundamental II às 7h10.
O Colégio tem duas unidades: Sede (Educação Infantil e Fundamental I) e Anexo (Fundamental II e Ensino Médio).
Chamamos de "etapa" o que outras escolas chamam de trimestre.`}
            className="field resize-none font-mono text-[0.8125rem] leading-relaxed"
          />
          <p className="mt-2 text-[0.75rem] text-muted">
            {context.length} / 2000 caracteres. Uma informação por linha funciona melhor.
          </p>
        </section>

        <div className="flex items-center gap-4">
          <button type="submit" className="btn-primary" disabled={pending || !ordered}>
            {pending ? 'Salvando…' : 'Salvar configurações'}
          </button>
          {state.saved ? (
            <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-success">
              <CheckIcon className="h-4 w-4" />
              Configurações atualizadas.
            </p>
          ) : null}
          {state.error ? (
            <p role="alert" className="text-[0.875rem] font-medium text-danger">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
