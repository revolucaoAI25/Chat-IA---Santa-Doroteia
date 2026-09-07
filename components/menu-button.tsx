'use client';

import { useDrawer } from './app-shell';

/** Abre a gaveta de navegação. Só aparece abaixo de `lg`. */
export function MenuButton() {
  const drawer = useDrawer();
  if (!drawer) return null;

  return (
    <button
      type="button"
      onClick={drawer.open}
      aria-label="Abrir menu"
      className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-chip-soft lg:hidden"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d="M3 5.5h14M3 10h14M3 14.5h14" />
      </svg>
    </button>
  );
}
