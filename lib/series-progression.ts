import { SERIES } from '@/lib/taxonomy';
import { currentAnoLetivo } from '@/lib/academic-calendar';
import type { Segment } from '@/lib/db/schema';

/**
 * Avanço automático de série na virada do ano letivo.
 *
 * A secretaria cadastra a série uma vez, junto com o ano letivo em que ela
 * vale. A partir daí o sistema calcula sozinho: em 2027, quem foi cadastrado
 * no 7º ano em 2026 é tratado como 8º ano.
 *
 * O cálculo é feito na leitura e **não grava nada**. Isso evita dois problemas
 * de uma rotina de promoção: avançar duas vezes se ela rodar duas vezes, e
 * precisar de um job agendado que pode simplesmente não rodar. O banco continua
 * guardando o fato original ("estava no 7º ano em 2026"), que é auditável; a
 * série vigente é uma consequência da data.
 *
 * A retenção de um aluno é tratada pela secretaria, atualizando o cadastro —
 * o sistema não tem como saber que alguém repetiu.
 */

export interface EffectiveSerie {
  serie: string | null;
  segment: Segment | null;
  /** Quantos anos letivos o cadastro avançou sozinho. */
  advancedBy: number;
  /** Passou da última série do Ensino Médio: o cadastro precisa de atenção. */
  concluido: boolean;
}

const ORDER = SERIES.map((s) => s.value);

export function effectiveSerie(
  serie: string | null,
  serieAnoLetivo: number | null,
  today = new Date(),
): EffectiveSerie {
  if (!serie) {
    return { serie: null, segment: null, advancedBy: 0, concluido: false };
  }

  const index = ORDER.indexOf(serie);
  if (index === -1) {
    // Série fora do vocabulário: devolve como está, sem inventar avanço.
    return { serie, segment: null, advancedBy: 0, concluido: false };
  }

  // Sem ano de referência, o cadastro é tratado como sendo do ano corrente.
  const years = serieAnoLetivo ? currentAnoLetivo(today) - serieAnoLetivo : 0;
  if (years <= 0) {
    return {
      serie,
      segment: SERIES[index].segment,
      advancedBy: 0,
      concluido: false,
    };
  }

  const target = index + years;

  if (target >= ORDER.length) {
    // Concluiu o Ensino Médio. Mantemos na última série em vez de zerar o
    // acesso de surpresa; cabe à secretaria desativar o cadastro.
    const last = SERIES[ORDER.length - 1];
    return {
      serie: last.value,
      segment: last.segment,
      advancedBy: years,
      concluido: true,
    };
  }

  return {
    serie: SERIES[target].value,
    segment: SERIES[target].segment,
    advancedBy: years,
    concluido: false,
  };
}
