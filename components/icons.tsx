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

export function GearIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 1.9l1 2.1 2.3-.5.6 2.3 2.2 1-1.2 2 1.2 2-2.2 1-.6 2.3-2.3-.5-1 2.1-1-2.1-2.3.5-.6-2.3-2.2-1 1.2-2-1.2-2 2.2-1 .6-2.3 2.3.5 1-2.1Z" />
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

export function FileIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" {...base}>
      <path d="M11.4 2.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.1l-4.6-4.6Z" />
      <path d="M11.2 2.6v4.6h4.6" />
    </svg>
  );
}
