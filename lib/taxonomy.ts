import type { DocumentTypeValue, Role, Segment } from '@/lib/db/schema';

/**
 * Vocabulário controlado da escola. É a única fonte de verdade para os rótulos
 * exibidos na interface, para os filtros e para o que a IA pode devolver na
 * classificação automática — manter tudo aqui evita divergência entre camadas.
 */

export const SEGMENT_LABELS: Record<Segment, string> = {
  educacao_infantil: 'Educação Infantil',
  fundamental_i: 'Fundamental I',
  fundamental_ii: 'Fundamental II',
  ensino_medio: 'Ensino Médio',
};

export const SEGMENTS = Object.keys(SEGMENT_LABELS) as Segment[];

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeValue, string> = {
  autorizacao: 'Autorização',
  bilhete: 'Bilhete',
  circular: 'Circular',
  comunicado: 'Comunicado',
  conteudo_avaliacao: 'Conteúdo de avaliação',
  convite: 'Convite',
  cronograma_provas: 'Cronograma de provas',
  lista_material: 'Lista material',
  prova: 'Prova',
  recuperacao: 'Recuperação',
  calendario: 'Calendário',
  regulamento: 'Regulamento',
  outro: 'Outro',
};

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentTypeValue[];

export const ROLE_LABELS: Record<Role, string> = {
  aluno: 'Aluno / Responsável',
  professor: 'Professor',
  coordenacao: 'Coordenação',
  admin: 'Administrador',
};

/** Séries na ordem em que aparecem no seletor das telas oficiais. */
export const SERIES: Array<{ value: string; label: string; segment: Segment }> = [
  { value: '1_ano_fund1', label: '1º ano · Fundamental I', segment: 'fundamental_i' },
  { value: '2_ano_fund1', label: '2º ano · Fundamental I', segment: 'fundamental_i' },
  { value: '3_ano_fund1', label: '3º ano · Fundamental I', segment: 'fundamental_i' },
  { value: '4_ano_fund1', label: '4º ano · Fundamental I', segment: 'fundamental_i' },
  { value: '5_ano_fund1', label: '5º ano · Fundamental I', segment: 'fundamental_i' },
  { value: '6_ano_fund2', label: '6º ano · Fundamental II', segment: 'fundamental_ii' },
  { value: '7_ano_fund2', label: '7º ano · Fundamental II', segment: 'fundamental_ii' },
  { value: '8_ano_fund2', label: '8º ano · Fundamental II', segment: 'fundamental_ii' },
  { value: '9_ano_fund2', label: '9º ano · Fundamental II', segment: 'fundamental_ii' },
  { value: '1_serie_em', label: '1ª série · Ensino Médio', segment: 'ensino_medio' },
  { value: '2_serie_em', label: '2ª série · Ensino Médio', segment: 'ensino_medio' },
  { value: '3_serie_em', label: '3ª série · Ensino Médio', segment: 'ensino_medio' },
];

const SERIES_BY_VALUE = new Map(SERIES.map((s) => [s.value, s]));

export function serieLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return SERIES_BY_VALUE.get(value)?.label ?? value;
}

export function segmentLabel(value: Segment | null | undefined): string {
  return value ? SEGMENT_LABELS[value] : '—';
}

/**
 * Abrangência de um documento numa linha só.
 *
 * `serieLabel` já carrega o segmento ("7º ano · Fundamental II"), o que fica
 * ótimo numa etiqueta isolada e péssimo numa lista: quatro séries do mesmo
 * segmento repetiam "Fundamental II" quatro vezes. Aqui as séries vêm sem o
 * sufixo e o segmento aparece uma vez, no fim.
 */
export function scopeLabel(
  series: string[] | undefined,
  segments: Segment[] | string[] | undefined,
): string {
  if (series && series.length > 0) {
    const nomes = series.map((s) => (SERIES_BY_VALUE.get(s)?.label ?? s).split(' · ')[0]);
    const segmentos = [
      ...new Set(series.map((s) => SERIES_BY_VALUE.get(s)?.segment).filter(Boolean)),
    ] as Segment[];

    const sufixo = segmentos.map((s) => SEGMENT_LABELS[s]).join(' e ');
    return sufixo ? `${nomes.join(', ')} · ${sufixo}` : nomes.join(', ');
  }

  if (segments && segments.length > 0) {
    return segments.map((s) => SEGMENT_LABELS[s as Segment] ?? s).join(', ');
  }

  return 'Toda a escola';
}

export function documentTypeLabel(value: DocumentTypeValue): string {
  return DOCUMENT_TYPE_LABELS[value] ?? 'Outro';
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  prova: 'Prova',
  recuperacao: 'Recuperação',
  simulado: 'Simulado',
  evento: 'Evento',
  entrega: 'Entrega',
};
