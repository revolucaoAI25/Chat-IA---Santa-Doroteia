import { logout } from '@/app/actions/auth';

/**
 * Barra superior fixa de cada tela: identificação da área à esquerda e a saída
 * à direita, como nas telas de referência.
 */
export function PageHeader({
  area,
  subtitle = 'Informação oficial da sua escola',
}: {
  area: string;
  subtitle?: string;
}) {
  return (
    // A rolagem acontece na coluna de conteúdo, não na página: o cabeçalho já
    // fica fixo por ser irmão dela, sem precisar de `sticky`.
    <header className="flex shrink-0 items-center justify-between border-b border-line bg-header px-10 py-4">
      <div>
        <div className="eyebrow">{area}</div>
        <div className="mt-0.5 text-[0.875rem] text-muted">{subtitle}</div>
      </div>
      <form action={logout}>
        <button type="submit" className="btn-ghost">
          Sair
        </button>
      </form>
    </header>
  );
}
