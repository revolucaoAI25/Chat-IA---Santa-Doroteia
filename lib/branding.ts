import type { Branding } from '@/lib/db/schema';

/**
 * Traduz a identidade visual do tenant para CSS variables.
 *
 * As mesmas variáveis que o tema define em `globals.css` são sobrescritas no
 * elemento raiz da aplicação, então mudar a cor primária no Whitelabel repinta
 * botões, links, chips e estados ativos de uma vez — sem classe condicional
 * espalhada pelos componentes.
 */

/** Pilhas completas, com fallback: sobrescrevem --font-sans / --font-serif. */
const SANS_STACK =
  'var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif';
const SERIF_STACK = "var(--font-spectral), ui-serif, Georgia, 'Times New Roman', serif";

export interface FontPreset {
  key: string;
  label: string;
  description: string;
  /** Famílias do Google Fonts carregadas em `app/fonts.ts`. */
  sans: string;
  serif: string;
}

/**
 * Presets em vez de campo livre de fonte: cada combinação já foi conferida
 * quanto a peso, altura de x e suporte a português, e as famílias precisam
 * estar pré-carregadas para não causar troca de fonte visível.
 */
export const FONT_PRESETS: FontPreset[] = [
  {
    key: 'institucional',
    label: 'Institucional',
    description: 'Serifa clássica nos títulos com sans neutra no texto. É o padrão do colégio.',
    sans: SANS_STACK,
    serif: SERIF_STACK,
  },
  {
    key: 'moderno',
    label: 'Moderno',
    description: 'Sans geométrica nos títulos e no texto. Mais próximo de um produto digital.',
    sans: SANS_STACK,
    serif: SANS_STACK,
  },
  {
    key: 'editorial',
    label: 'Editorial',
    description: 'Serifa também no corpo do texto. Leitura mais formal, boa para documentos longos.',
    sans: SERIF_STACK,
    serif: SERIF_STACK,
  },
];

export const DEFAULT_FONT_PRESET = FONT_PRESETS[0];

export function fontPreset(key: string | undefined): FontPreset {
  return FONT_PRESETS.find((p) => p.key === key) ?? DEFAULT_FONT_PRESET;
}

/** Aceita apenas cor hexadecimal, para que nada do banco vire CSS arbitrário. */
const HEX = /^#[0-9a-fA-F]{6}$/;

function safeColor(value: string | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

/**
 * Monta o objeto de estilo aplicado no elemento raiz.
 *
 * Só entram valores validados: `branding` vem de uma coluna jsonb e é editável
 * pelo administrador, então tratamos como entrada não confiável antes de virar
 * CSS.
 */
export function brandingStyle(branding: Branding | null | undefined): React.CSSProperties {
  const style: Record<string, string> = {};
  if (!branding) return style as React.CSSProperties;

  const mapping: Array<[keyof Branding, string]> = [
    ['primary', '--color-navy'],
    ['primaryHover', '--color-navy-hover'],
    ['primarySoft', '--color-navy-soft'],
    ['background', '--color-bg'],
    ['surface', '--color-surface'],
    ['ink', '--color-ink'],
    ['accent', '--color-accent'],
  ];

  for (const [key, variable] of mapping) {
    const color = safeColor(branding[key] as string | undefined);
    if (color) style[variable] = color;
  }

  // Sobrescreve as próprias variáveis do tema: assim toda utilitária
  // `font-sans`/`font-serif` já existente passa a usar o preset escolhido.
  const preset = fontPreset(branding.fontPreset);
  style['--font-sans'] = preset.sans;
  style['--font-serif'] = preset.serif;

  return style as React.CSSProperties;
}

/** Largura do logo, limitada à faixa que o layout da barra lateral comporta. */
export function logoSize(branding: Branding | null | undefined): number {
  const size = Number(branding?.logoSize);
  if (!Number.isFinite(size)) return 176;
  return Math.min(240, Math.max(96, Math.round(size)));
}

/** Valores usados pela prévia quando o campo ainda não foi definido. */
export const BRANDING_DEFAULTS: Required<Omit<Branding, 'fontPreset' | 'logoSize'>> & {
  fontPreset: string;
  logoSize: number;
} = {
  primary: '#0F3B85',
  primaryHover: '#0C2F6B',
  primarySoft: '#DCE2EC',
  background: '#F5F3EC',
  surface: '#FEFEFD',
  ink: '#101713',
  accent: '#B58A1B',
  fontPreset: 'institucional',
  logoSize: 176,
};
