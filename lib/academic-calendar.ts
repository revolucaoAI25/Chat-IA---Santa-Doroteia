/**
 * Calendário acadêmico do colégio: ano letivo dividido em três etapas
 * (trimestres).
 *
 * Serve para duas coisas:
 *  - informar ao assistente a data de hoje e a etapa vigente, para que ele
 *    entenda "a prova" ou "esta etapa" sem precisar perguntar;
 *  - avançar a série dos alunos automaticamente na virada do ano letivo.
 *
 * As datas de corte são um palpite razoável para o calendário escolar
 * brasileiro e devem ser confirmadas com a secretaria. Ficam em variável de
 * ambiente justamente para serem corrigidas sem mexer no código.
 */

export interface Etapa {
  numero: 1 | 2 | 3;
  label: string;
  anoLetivo: number;
  /** Falso fora do período letivo (férias de janeiro, recesso de fim de ano). */
  emAndamento: boolean;
}

/**
 * Fim de cada etapa, em MM-DD. `ACADEMIC_ETAPA_ENDS=05-15,08-31,12-20`
 * significa: 1ª até 15/05, 2ª até 31/08, 3ª até 20/12.
 */
const DEFAULT_ENDS = ['05-15', '08-31', '12-20'];
/** Antes disso, o ano letivo ainda não começou. */
const DEFAULT_START = '02-01';

function boundaries(): { start: string; ends: string[] } {
  const raw = process.env.ACADEMIC_ETAPA_ENDS;
  const ends = raw
    ? raw.split(',').map((s) => s.trim()).filter((s) => /^\d{2}-\d{2}$/.test(s))
    : [];

  return {
    start: process.env.ACADEMIC_YEAR_START ?? DEFAULT_START,
    ends: ends.length === 3 ? ends : DEFAULT_ENDS,
  };
}

/** Etapa vigente na data informada (padrão: hoje). */
export function currentEtapa(today = new Date()): Etapa {
  const { start, ends } = boundaries();
  const anoLetivo = today.getFullYear();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  // Antes do início: ainda é recesso, mas a 1ª etapa é a próxima referência.
  if (monthDay < start) {
    return { numero: 1, label: '1ª etapa', anoLetivo, emAndamento: false };
  }

  for (const [index, end] of ends.entries()) {
    if (monthDay <= end) {
      const numero = (index + 1) as 1 | 2 | 3;
      return { numero, label: `${numero}ª etapa`, anoLetivo, emAndamento: true };
    }
  }

  // Depois do fim da 3ª etapa: recesso de fim de ano.
  return { numero: 3, label: '3ª etapa', anoLetivo, emAndamento: false };
}

/** "segunda-feira, 07 de setembro de 2026" */
export function formatToday(today = new Date()): string {
  return today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: SCHOOL_TIMEZONE,
  });
}

/**
 * Fuso do colégio. Fixado porque o servidor roda em UTC na Vercel, e uma prova
 * às 7h10 não pode virar "ontem" por causa disso.
 */
export const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE ?? 'America/Sao_Paulo';

/** Data de hoje no fuso do colégio, em YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  // en-CA formata como YYYY-MM-DD, que é o que o Postgres espera.
  return now.toLocaleDateString('en-CA', { timeZone: SCHOOL_TIMEZONE });
}

/**
 * Ano letivo corrente. Vira em janeiro: em dezembro de 2026 ainda é 2026, em
 * fevereiro de 2027 já é 2027. É a base do avanço automático de série.
 */
export function currentAnoLetivo(today = new Date()): number {
  return Number(todayISO(today).slice(0, 4));
}
