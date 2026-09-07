import { stopViewingAs } from '@/app/actions/auth';
import { EyeIcon } from './icons';
import { ROLE_LABELS, serieLabel } from '@/lib/taxonomy';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Faixa de "vendo como".
 *
 * Fica sempre visível, em cor diferente do resto da interface, porque o risco
 * desta funcionalidade não é técnico e sim humano: um administrador esquecer
 * que está na pele de outra pessoa e concluir que o sistema está errado — ou
 * pior, escrever algo achando que fala como ele mesmo.
 */
export function ImpersonationBanner({ user }: { user: SessionUser }) {
  if (!user.impersonator) return null;

  const context =
    user.role === 'aluno' && user.serie ? serieLabel(user.serie) : ROLE_LABELS[user.role];

  return (
    <div className="shrink-0 bg-navy text-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-10">
        <p className="flex min-w-0 items-center gap-2 text-[0.8125rem] leading-snug">
          <EyeIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            Você está vendo o sistema como <strong className="font-bold">{user.name}</strong>
            <span className="hidden sm:inline"> · {context}</span>
          </span>
        </p>

        <form action={stopViewingAs} className="shrink-0">
          <button
            type="submit"
            className="rounded-full bg-white/15 px-4 py-1.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-white/25"
          >
            Voltar ao meu acesso
          </button>
        </form>
      </div>
    </div>
  );
}
