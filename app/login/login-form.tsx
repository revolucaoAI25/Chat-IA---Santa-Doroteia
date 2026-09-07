'use client';

import { useActionState, useTransition } from 'react';
import { Logo } from '@/components/logo';
import { AlertIcon, ArrowUpRightIcon } from '@/components/icons';
import { ROLE_LABELS, serieLabel } from '@/lib/taxonomy';
import { login, loginAsDemo, type LoginState } from '@/app/actions/auth';
import type { Role } from '@/lib/db/schema';

interface DemoProfile {
  matricula: string;
  name: string;
  role: Role;
  serie: string | null;
  turma: string | null;
}

export function LoginForm({
  demoProfiles,
  logoUrl,
  logoSize = 188,
  schoolName,
}: {
  demoProfiles: DemoProfile[];
  logoUrl?: string | null;
  logoSize?: number;
  schoolName?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const [switching, startSwitch] = useTransition();

  return (
    <section className="flex w-full flex-col justify-center px-6 py-12 sm:px-14 lg:w-[46rem] lg:px-20">
      <div className="mx-auto w-full max-w-[26rem]">
        <Logo size={logoSize} logoUrl={logoUrl} schoolName={schoolName} />

        <div className="mt-12">
          <p className="eyebrow">Acesso</p>
          <h1 className="display mt-2 text-[1.875rem] sm:text-[2.125rem] lg:text-[2.5rem]">Entrar no assistente</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
            Use a sua matrícula do colégio. O perfil define quais documentos você enxerga e como
            o assistente fala com você.
          </p>
        </div>

        <form action={formAction} className="mt-9 space-y-5">
          <div>
            <label className="field-label" htmlFor="identifier">
              Matrícula ou e-mail
            </label>
            <input
              id="identifier"
              name="identifier"
              className="field"
              placeholder="2026074"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="field"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[0.8125rem] font-medium text-danger"
            >
              <AlertIcon className="h-4 w-4 shrink-0" />
              {state.error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={pending || switching}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {demoProfiles.length > 0 ? (
          <div className="mt-10">
            <div className="flex items-center gap-3">
              <span className="eyebrow-muted whitespace-nowrap">Acesso rápido do protótipo</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="mt-4 space-y-2">
              {demoProfiles.map((profile) => (
                <button
                  key={profile.matricula}
                  type="button"
                  disabled={switching || pending}
                  onClick={() => startSwitch(() => void loginAsDemo(profile.matricula))}
                  className="card group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:border-navy/40 hover:bg-chip-soft disabled:opacity-60"
                >
                  <span>
                    <span className="block text-[0.875rem] font-semibold text-ink">
                      {profile.name}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {ROLE_LABELS[profile.role]}
                      {profile.serie ? ` · ${serieLabel(profile.serie)}` : ''}
                      {profile.turma ? ` · Turma ${profile.turma}` : ''}
                    </span>
                  </span>
                  <ArrowUpRightIcon className="h-4 w-4 shrink-0 text-navy opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>

            <p className="mt-4 text-[0.75rem] leading-relaxed text-muted">
              Entra sem senha para comparar os perfis lado a lado. Disponível apenas fora de
              produção — em produção exige <code className="font-mono">ENABLE_DEMO_LOGIN=true</code>.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
