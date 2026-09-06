/**
 * Marca do colégio.
 *
 * O brasão original não acompanha este repositório, então o componente desenha
 * um selo tipográfico com a mesma composição das telas de referência
 * ("Colégio" pequeno acima, o nome em duas linhas, a cidade em itálico).
 * Quando o tenant tem `logoUrl` — o que a tela de Whitelabel preenche — a
 * imagem real substitui o desenho, sem mudar o espaço reservado no layout.
 */
export function Logo({ size = 176, logoUrl }: { size?: number; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL arbitrária de tenant
      <img
        src={logoUrl}
        alt="Colégio Santa Dorotéia — Belo Horizonte"
        style={{ width: size }}
        className="h-auto"
      />
    );
  }

  return (
    <div
      style={{ width: size }}
      className="flex items-center gap-2.5"
      aria-label="Colégio Santa Dorotéia — Belo Horizonte"
      role="img"
    >
      <Crest className="h-[52px] w-[52px] shrink-0" />
      <div className="leading-none">
        <div className="text-[9px] font-semibold tracking-[0.02em] text-navy">Colégio</div>
        <div className="font-serif text-[19px] font-semibold leading-[1.04] tracking-tight text-navy">
          Santa
          <br />
          Dorotéia
        </div>
        <div className="mt-[3px] text-[8.5px] font-medium italic tracking-[0.03em] text-navy">
          Belo Horizonte
        </div>
      </div>
    </div>
  );
}

/** Selo circular: moldura dourada, campo azul e a árvore do brasão. */
function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#C9A227" />
      <circle cx="32" cy="32" r="26" fill="#FDFCF7" />
      <circle cx="32" cy="32" r="22" fill="#2E6FA8" />
      <path d="M32 16c-6 0-10 4.4-10 9.6 0 4 2.6 7.2 6.4 8.6V40h7.2v-5.8c3.8-1.4 6.4-4.6 6.4-8.6C42 20.4 38 16 32 16Z" fill="#2F7D46" />
      <rect x="30.6" y="38" width="2.8" height="8" rx="1" fill="#6B4A22" />
      <path d="M22 46h20" stroke="#C9A227" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
