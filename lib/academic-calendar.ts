import type { TenantSettings } from '@/lib/db/schema';

/**
 * Calendário acadêmico do colégio: ano letivo dividido em três etapas
 * (trimestres).
 *
 * Serve para duas coisas:
 *  - informar ao assistente a data de hoje e a etapa vigente, para que ele
 *    entenda "a prova" ou "esta etapa" sem precisar perguntar;
 *  - avançar a série dos alunos automaticamente na virada do ano letivo.
 *
 * As datas de corte vêm das configurações do tenant, editáveis pelo
 * administrador. Os padrões abaixo são um palpite razoável para o calendário
 * escolar brasileiro, usados só até a secretaria informar os reais.
 */

export interface Etapa {
  numero: 1 | 2 | 3;
  label: string;
  anoLetivo: number;
  /** Falso fora do período letivo (férias de janeiro, recesso de fim de ano). */
  emAndamento: boolean;
}

export const DEFAULT_ETAPA_ENDS: [string, string, string] = ['05-15', '08-31', '12-20'];
export const DEFAULT_YEAR_START = '02-01';
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Fusos plausíveis para uma escola brasileira.
 *
 * Fica aqui, e não no módulo de server actions: um arquivo `'use server'` só
 * pode exportar funções async, e uma constante exportada de lá chega quebrada
 * no cliente.
 */
export const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Rio_Branco',
];

const MONTH_DAY = /^\d{2}-\d{2}$/;

/** Aplica os padrões e descarta valor malformado vindo do jsonb. */
export function resolveCalendar(settings: TenantSettings | null | undefined) {
  const ends = settings?.etapaEnds;
  const valid =
    Array.isArray(ends) && ends.length === 3 && ends.every((e) => MONTH_DAY.test(e));

  return {
    yearStart:
      settings?.yearStart && MONTH_DAY.test(settings.yearStart)
        ? settings.yearStart
        : DEFAULT_YEAR_START,
    etapaEnds: (valid ? ends : DEFAULT_ETAPA_ENDS) as [string, string, string],
    timezone: settings?.timezone || DEFAULT_TIMEZONE,
  };
}

/** Etapa vigente na data informada. */
export function currentEtapa(
  settings?: TenantSettings | null,
  today = new Date(),
): Etapa {
  const { yearStart, etapaEnds, timezone } = resolveCalendar(settings);

  const iso = todayISO(today, timezone);
  const anoLetivo = Number(iso.slice(0, 4));
  const monthDay = iso.slice(5);

  // Antes do início: ainda é recesso, mas a 1ª etapa é a próxima referência.
  if (monthDay < yearStart) {
    return { numero: 1, label: '1ª etapa', anoLetivo, emAndamento: false };
  }

  for (const [index, end] of etapaEnds.entries()) {
    if (monthDay <= end) {
      const numero = (index + 1) as 1 | 2 | 3;
      return { numero, label: `${numero}ª etapa`, anoLetivo, emAndamento: true };
    }
  }

  // Depois do fim da 3ª etapa: recesso de fim de ano.
  return { numero: 3, label: '3ª etapa', anoLetivo, emAndamento: false };
}

/** "segunda-feira, 07 de setembro de 2026" */
export function formatToday(
  settings?: TenantSettings | null,
  today = new Date(),
): string {
  return today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: resolveCalendar(settings).timezone,
  });
}

/**
 * Data de hoje no fuso do colégio, em YYYY-MM-DD.
 *
 * O fuso importa porque o servidor roda em UTC na Vercel: sem isso, entre 21h
 * e meia-noite em Belo Horizonte o sistema já estaria no dia seguinte, e uma
 * prova de hoje apareceria como "ontem".
 */
export function todayISO(now = new Date(), timezone = DEFAULT_TIMEZONE): string {
  // en-CA formata como YYYY-MM-DD, que é o que o Postgres espera.
  return now.toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * Ano letivo corrente. Vira em janeiro: em dezembro de 2026 ainda é 2026, em
 * fevereiro de 2027 já é 2027. É a base do avanço automático de série.
 */
export function currentAnoLetivo(today = new Date()): number {
  return Number(todayISO(today).slice(0, 4));
}
