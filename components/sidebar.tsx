'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { GearIcon, SparkleIcon } from './icons';
import { ROLE_LABELS } from '@/lib/taxonomy';
import type { SessionUser } from '@/lib/auth/session';

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
}

export function Sidebar({ user, logoUrl }: { user: SessionUser; logoUrl?: string | null }) {
  const pathname = usePathname();

  const items: NavItem[] = [{ href: '/chat', label: 'Assistente', icon: SparkleIcon }];
  if (user.role === 'admin' || user.role === 'coordenacao') {
    items.push({ href: '/admin', label: 'Administração', icon: GearIcon });
  }

  return (
    <aside className="flex w-[272px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <div className="flex justify-center px-6 pb-7 pt-7">
        <Logo logoUrl={logoUrl} />
      </div>

      <nav className="flex flex-col gap-1 px-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[0.9375rem] font-semibold transition-colors ${
                active
                  ? 'bg-navy-soft text-navy'
                  : 'text-ink hover:bg-chip-soft'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-6 my-6 border-t border-line" />

      <div className="px-6">
        <div className="eyebrow-muted mb-3">Suas áreas</div>
        <ul className="space-y-2">
          {areasFor(user).map((area) => (
            <li key={area} className="flex items-start gap-2 text-[0.8125rem] text-muted">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D8B234]" />
              {area}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto border-t border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-soft text-sm font-bold text-navy">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[0.875rem] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[0.75rem] text-muted">{ROLE_LABELS[user.role]}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Resume, em uma linha, o recorte de conteúdo daquele perfil. */
function areasFor(user: SessionUser): string[] {
  switch (user.role) {
    case 'aluno':
      return ['Circulares e Conteúdos', 'Provas e Avaliações', 'Eventos do Colégio'];
    case 'professor':
      return ['Circulares e Conteúdos', 'Orientações ao Corpo Docente', 'Todas as séries'];
    default:
      return ['Circulares e Conteúdos', 'Acervo completo'];
  }
}
