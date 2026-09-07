'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Estrutura da aplicação, com navegação responsiva.
 *
 * A partir de `lg` a barra lateral é fixa, como nas telas de referência.
 * Abaixo disso ela vira uma gaveta: 272px fixos num celular de 390px deixariam
 * ~118px para o conteúdo, o que torna a tela inutilizável — e boa parte dos
 * responsáveis vai acessar pelo telefone.
 */

const DrawerContext = createContext<{ open: () => void } | null>(null);

/** Usado pelo botão de menu no cabeçalho de cada tela. */
export function useDrawer() {
  return useContext(DrawerContext);
}

export function AppShell({
  user,
  logoUrl,
  logoSize,
  schoolName,
  style,
  children,
}: {
  user: SessionUser;
  logoUrl?: string | null;
  logoSize?: number;
  schoolName?: string;
  /** CSS variables da identidade visual do tenant. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navegar fecha a gaveta: sem isto, o menu continuaria aberto por cima da
  // tela recém-aberta.
  useEffect(() => setOpen(false), [pathname]);

  // Esc fecha, e o corpo não rola por trás do overlay.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const sidebar = (
    <Sidebar user={user} logoUrl={logoUrl} logoSize={logoSize} schoolName={schoolName} />
  );

  return (
    <DrawerContext.Provider value={{ open: () => setOpen(true) }}>
      <div className="flex h-screen overflow-hidden" style={style}>
        {/* Fixa no desktop */}
        <div className="hidden lg:flex">{sidebar}</div>

        {/* Gaveta no celular e no tablet */}
        {/*
          `inert` (e não só `pointer-events-none`) porque o mouse não é o único
          jeito de chegar num link: sem isto, o Tab entraria na gaveta fechada e
          o foco sumiria fora da tela.
        */}
        <div
          className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}
          inert={!open}
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${
              open ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-y-0 left-0 flex shadow-xl transition-transform duration-200 ${
              open ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {sidebar}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </DrawerContext.Provider>
  );
}
