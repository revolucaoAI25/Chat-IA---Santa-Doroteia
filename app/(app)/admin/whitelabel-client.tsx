'use client';

import { useActionState, useState } from 'react';
import { AlertIcon, CheckIcon, SparkleIcon } from '@/components/icons';
import { Logo } from '@/components/logo';
import { BRANDING_DEFAULTS, FONT_PRESETS, brandingStyle } from '@/lib/branding';
import { saveBranding, type BrandingState } from '@/app/actions/branding';
import type { Branding } from '@/lib/db/schema';

const COLOR_FIELDS: Array<{ key: keyof Branding; label: string; help: string }> = [
  { key: 'primary', label: 'Cor principal', help: 'Botões, links, item ativo do menu e destaques.' },
  { key: 'primaryHover', label: 'Principal (hover)', help: 'Tom mais escuro, usado ao passar o mouse.' },
  { key: 'primarySoft', label: 'Principal suave', help: 'Fundo do item ativo e da bolha de pergunta.' },
  { key: 'accent', label: 'Destaque', help: 'Rótulo “Assistente oficial” e marcadores.' },
  { key: 'background', label: 'Fundo da página', help: 'A cor de base de todas as telas.' },
  { key: 'surface', label: 'Superfície', help: 'Cartões, barra lateral e campos.' },
  { key: 'ink', label: 'Texto', help: 'Cor do texto principal.' },
];

export function WhitelabelClient({
  displayName,
  logoUrl,
  branding,
  storage,
}: {
  displayName: string;
  logoUrl: string | null;
  branding: Branding;
  storage: 'supabase' | 'local';
}) {
  const [state, formAction, pending] = useActionState<BrandingState, FormData>(saveBranding, {});

  // Estado local para a prévia responder a cada ajuste, antes de salvar.
  const [draft, setDraft] = useState<Branding>({
    ...branding,
    fontPreset: branding.fontPreset ?? BRANDING_DEFAULTS.fontPreset,
    logoSize: branding.logoSize ?? BRANDING_DEFAULTS.logoSize,
  });
  const [name, setName] = useState(displayName);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const set = (key: keyof Branding, value: string | number) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const colorValue = (key: keyof Branding) =>
    (draft[key] as string | undefined) ?? (BRANDING_DEFAULTS[key as 'primary'] as string);

  const effectiveLogo = removeLogo ? null : (logoPreview ?? logoUrl);

  return (
    <div>
      <p className="eyebrow">Identidade da escola</p>
      <h1 className="display mt-2 text-[1.875rem] sm:text-[2.125rem] lg:text-[2.5rem]">Ajuste o seu whitelabel</h1>
      <p className="mt-3 max-w-[42rem] text-[0.9375rem] leading-relaxed text-muted">
        As alterações de nome, logo, cores e tipografia passam a valer para este tenant assim que
        forem salvas. A prévia ao lado usa os valores atuais do formulário.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form action={formAction} className="space-y-6">
          <section className="panel p-4 sm:p-6">
            <p className="eyebrow-muted">Marca</p>

            <div className="mt-4">
              <label className="field-label" htmlFor="displayName">
                Nome de exibição
              </label>
              <input
                id="displayName"
                name="displayName"
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
              />
            </div>

            <div className="mt-5">
              <label className="field-label" htmlFor="logo">
                Arquivo do logo
              </label>
              {/* Input escondido com rótulo próprio: o controle nativo mostra
                  "No file chosen" no idioma do navegador, que quebra a tela. */}
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setLogoName(file?.name ?? null);
                  setLogoPreview(file ? URL.createObjectURL(file) : null);
                  if (file) setRemoveLogo(false);
                }}
              />
              <label
                htmlFor="logo"
                className="flex w-full cursor-pointer flex-col items-center rounded-lg border border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors hover:bg-chip-soft"
              >
                <span className="text-[0.875rem] font-bold text-navy">
                  {logoName ? 'Trocar arquivo' : 'Selecionar PNG, JPEG, WebP ou SVG'}
                </span>
                {logoName ? (
                  <span className="mt-1 max-w-full truncate text-[0.75rem] text-muted">
                    {logoName}
                  </span>
                ) : null}
              </label>
              <p className="mt-2 text-[0.75rem] text-muted">
                PNG, JPEG, WebP ou SVG, até 4 MB. Sem logo, a marca tipográfica padrão é usada.
              </p>
              {logoUrl && !removeLogo ? (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveLogo(true);
                    setLogoPreview(null);
                  }}
                  className="mt-2 text-[0.75rem] font-semibold text-danger underline"
                >
                  Remover logo atual
                </button>
              ) : null}
              <input type="hidden" name="removeLogo" value={String(removeLogo)} />
            </div>

            <div className="mt-5">
              <label className="field-label" htmlFor="logoSize">
                Tamanho na barra lateral
                <span className="ml-2 font-mono text-navy">{draft.logoSize} px</span>
              </label>
              <input
                id="logoSize"
                name="logoSize"
                type="range"
                min={96}
                max={240}
                step={4}
                value={draft.logoSize}
                onChange={(event) => set('logoSize', Number(event.target.value))}
                className="w-full accent-navy"
              />
            </div>
          </section>

          <section className="panel p-4 sm:p-6">
            <p className="eyebrow-muted">Cores</p>
            <div className="mt-4 space-y-4">
              {COLOR_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <input
                    type="color"
                    name={field.key}
                    value={colorValue(field.key)}
                    onChange={(event) => set(field.key, event.target.value.toUpperCase())}
                    aria-label={field.label}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-semibold text-ink">{field.label}</p>
                    <p className="text-[0.75rem] leading-snug text-muted">{field.help}</p>
                  </div>
                  <code className="shrink-0 font-mono text-[0.75rem] text-muted">
                    {colorValue(field.key)}
                  </code>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-4 sm:p-6">
            <p className="eyebrow-muted">Tipografia</p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              Combinações prontas em vez de campo livre: cada uma já foi conferida quanto a peso,
              legibilidade e acentuação do português.
            </p>
            <div className="mt-4 space-y-2">
              {FONT_PRESETS.map((preset) => (
                <label
                  key={preset.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    draft.fontPreset === preset.key
                      ? 'border-navy bg-chip-soft'
                      : 'border-line bg-surface hover:bg-chip-soft'
                  }`}
                >
                  <input
                    type="radio"
                    name="fontPreset"
                    value={preset.key}
                    checked={draft.fontPreset === preset.key}
                    onChange={() => set('fontPreset', preset.key)}
                    className="mt-1 accent-navy"
                  />
                  <span>
                    <span className="block text-[0.875rem] font-bold text-ink">{preset.label}</span>
                    <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">
                      {preset.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {storage === 'local' ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              O logo será gravado em <code className="font-mono">./storage</code>. Na Vercel,
              configure o Supabase Storage — o disco lá é somente leitura.
            </p>
          ) : null}

          <div className="flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar identidade'}
            </button>
            {state.saved ? (
              <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-success">
                <CheckIcon className="h-4 w-4" />
                Identidade atualizada.
              </p>
            ) : null}
            {state.error ? (
              <p role="alert" className="text-[0.875rem] font-medium text-danger">
                {state.error}
              </p>
            ) : null}
          </div>
        </form>

        {/* Prévia: as mesmas CSS variables do app, aplicadas num recorte real. */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <p className="eyebrow-muted mb-3">Prévia</p>
          <div
            className="overflow-hidden rounded-xl border border-line"
            style={brandingStyle(draft)}
          >
            <div className="flex bg-bg">
              <div className="w-[42%] shrink-0 border-r border-line bg-surface p-3">
                <Logo size={Math.round((draft.logoSize ?? 176) * 0.62)} logoUrl={effectiveLogo} schoolName={name} />
                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-1.5 rounded-lg bg-navy-soft px-2 py-1.5 text-[0.6875rem] font-semibold text-navy">
                    <SparkleIcon className="h-3 w-3" />
                    Assistente
                  </div>
                  <div className="px-2 py-1.5 text-[0.6875rem] font-semibold text-ink">
                    Meu perfil
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 p-3">
                <p className="text-[0.5rem] font-bold uppercase tracking-[0.11em] text-navy">
                  Chat fundamentado
                </p>
                <p className="mt-1 font-serif text-[0.9375rem] leading-tight text-ink">
                  Pergunte sobre os documentos oficiais
                </p>

                <div className="mt-3 flex justify-end">
                  <span className="rounded-lg rounded-br-sm bg-navy-soft px-2 py-1 text-[0.5625rem] text-ink">
                    Quando é a prova?
                  </span>
                </div>

                <p className="mt-2.5 text-[0.5rem] font-bold uppercase tracking-[0.11em] text-accent">
                  Assistente oficial
                </p>
                <p className="mt-1 text-[0.5625rem] leading-relaxed text-ink">
                  A prova de matemática é <strong>15 de setembro</strong>, às 7h10.
                </p>

                <div className="mt-2 rounded-md border border-line bg-surface p-1.5">
                  <p className="text-[0.4375rem] font-bold uppercase tracking-wider text-navy">
                    Cronograma · Nº 231
                  </p>
                  <p className="font-serif text-[0.5625rem] text-ink">Avaliações da 3ª Etapa</p>
                </div>

                <div className="mt-3 flex justify-end">
                  <span className="rounded-full bg-navy px-2.5 py-1 text-[0.5rem] font-bold text-white">
                    Enviar
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
            A prévia usa exatamente as mesmas variáveis de tema da aplicação, então o que aparece
            aqui é o que você verá depois de salvar.
          </p>
        </aside>
      </div>
    </div>
  );
}
