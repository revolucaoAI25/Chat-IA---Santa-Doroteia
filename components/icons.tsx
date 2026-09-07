/** Ícones de traço, 1.6px, alinhados ao conjunto usado nas telas de referência. */

type Props = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function SparkleIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7 10 2.5Z" />
      <path d="M15.4 13.6 16 15.4l1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8Z" />
    </svg>
  );
}

export function DocumentIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <rect x="3.5" y="2.5" width="13" height="15" rx="2" />
      <path d="M6.6 6.6h6.8M6.6 10h6.8M6.6 13.4h4.2" />
    </svg>
  );
}

export function CalendarIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
      <path d="M2.5 8h15M6.6 2.5v3M13.4 2.5v3" />
    </svg>
  );
}

/**
 * Engrenagem de oito dentes.
 *
 * O contorno é calculado, não desenhado à mão: cada dente ocupa o mesmo arco
 * (±9° na ponta, ±15,5° na raiz) sobre os raios 8 e 6,1, a cada 45°. O desenho
 * anterior era um polígono de doze vértices com dentes de tamanhos diferentes e,
 * a 20px, lia como uma estrela amassada — que é o "desformatado" que se via no
 * menu.
 */
export function GearIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M8.37 4.12 L8.75 2.1 A8 8 0 0 1 11.25 2.1 L11.63 4.12 A6.1 6.1 0 0 1 13 4.69 L14.7 3.53 A8 8 0 0 1 16.47 5.3 L15.31 7 A6.1 6.1 0 0 1 15.88 8.37 L17.9 8.75 A8 8 0 0 1 17.9 11.25 L15.88 11.63 A6.1 6.1 0 0 1 15.31 13 L16.47 14.7 A8 8 0 0 1 14.7 16.47 L13 15.31 A6.1 6.1 0 0 1 11.63 15.88 L11.25 17.9 A8 8 0 0 1 8.75 17.9 L8.37 15.88 A6.1 6.1 0 0 1 7 15.31 L5.3 16.47 A8 8 0 0 1 3.53 14.7 L4.69 13 A6.1 6.1 0 0 1 4.12 11.63 L2.1 11.25 A8 8 0 0 1 2.1 8.75 L4.12 8.37 A6.1 6.1 0 0 1 4.69 7 L3.53 5.3 A8 8 0 0 1 5.3 3.53 L7 4.69 Z" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>
  );
}

export function UploadIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M10 13.4V3.6M6.4 7.2 10 3.6l3.6 3.6" />
      <path d="M3.4 13v2.4a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6V13" />
    </svg>
  );
}

export function ArrowUpIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="M10 16V4.6M4.8 9.8 10 4.6l5.2 5.2" />
    </svg>
  );
}

export function ArrowUpRightIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M6.4 13.6 13.6 6.4M7.6 6.4h6v6" />
    </svg>
  );
}

export function CheckIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="M4.4 10.4 8 14l7.6-8" />
    </svg>
  );
}

export function AlertIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.2v4.4M10 13.4h.01" />
    </svg>
  );
}

export function SpinnerIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="M10 2.6a7.4 7.4 0 1 0 7.4 7.4" />
    </svg>
  );
}

export function UserIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <circle cx="10" cy="6.6" r="3.1" />
      <path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" />
    </svg>
  );
}

export function ThumbUpIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M6.2 17.4V8.6l3.4-6a1.7 1.7 0 0 1 2.4 1.9l-.8 3.3h3.9a1.7 1.7 0 0 1 1.6 2.1l-1.4 5.6a1.7 1.7 0 0 1-1.6 1.3H6.2Z" />
      <path d="M6.2 8.6H2.9v8.8h3.3" />
    </svg>
  );
}

export function ThumbDownIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M13.8 2.6v8.8l-3.4 6a1.7 1.7 0 0 1-2.4-1.9l.8-3.3H4.9a1.7 1.7 0 0 1-1.6-2.1l1.4-5.6a1.7 1.7 0 0 1 1.6-1.3h7.5Z" />
      <path d="M13.8 11.4h3.3V2.6h-3.3" />
    </svg>
  );
}

export function SearchIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="m12.7 12.7 4 4" />
    </svg>
  );
}

export function EyeIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M1.9 10S4.9 4.6 10 4.6 18.1 10 18.1 10 15.1 15.4 10 15.4 1.9 10 1.9 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}

export function PlusIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="M10 4.4v11.2M4.4 10h11.2" />
    </svg>
  );
}

export function XIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function DownloadIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M10 2.8v9.8M6.4 9l3.6 3.6L13.6 9" />
      <path d="M3.4 13.6V16a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6v-2.4" />
    </svg>
  );
}

/** Aponta para baixo; quem abre gira 180° por CSS. */
export function ChevronDownIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base} strokeWidth={2}>
      <path d="m5.5 8 4.5 4.5L14.5 8" />
    </svg>
  );
}

export function FileIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M11.4 2.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.1l-4.6-4.6Z" />
      <path d="M11.2 2.6v4.6h4.6" />
    </svg>
  );
}
