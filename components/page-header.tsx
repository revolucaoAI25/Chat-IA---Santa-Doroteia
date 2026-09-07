import { logout } from '@/app/actions/auth';
import { MenuButton } from './menu-button';

/**
 * Barra superior de cada tela: identificação da área à esquerda e a saída à
 * direita, como nas telas de referência. Abaixo de `lg` ganha o botão que abre
 * a gaveta de navegação.
 */
export function PageHeader({
  area,
  subtitle = 'Informação oficial da sua escola',
}: {
  area: string;
  subtitle?: string;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-header px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
      <MenuButton />

      <div className="min-w-0 flex-1">
        <div className="eyebrow truncate">{area}</div>
        <div className="mt-0.5 truncate text-[0.8125rem] text-muted sm:text-[0.875rem]">
          {subtitle}
        </div>
      </div>

      <form action={logout} className="shrink-0">
        <button type="submit" className="btn-ghost px-4 py-1.5 text-[0.8125rem] sm:px-5 sm:py-2 sm:text-[0.875rem]">
          Sair
        </button>
      </form>
    </header>
  );
}
