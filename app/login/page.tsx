import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { demoLoginEnabled } from '@/lib/auth/demo';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar · Colégio Santa Dorotéia' };

export default async function LoginPage() {
  if (await getSession()) redirect('/chat');

  const showDemo = demoLoginEnabled();

  // Os cartões de acesso rápido são montados a partir do banco, para nunca
  // oferecerem um perfil que o seed não criou.
  const demoProfiles = showDemo
    ? (
        await db
          .select({
            matricula: users.matricula,
            name: users.name,
            role: users.role,
            serie: users.serie,
            turma: users.turma,
          })
          .from(users)
          .where(eq(users.active, true))
      ).filter((u) => ['2026074', 'P1042', 'ADM001'].includes(u.matricula))
    : [];

  return (
    <main className="flex min-h-screen">
      <LoginForm demoProfiles={demoProfiles} />

      {/* Painel institucional: só decorativo, escondido no mobile. */}
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-navy p-14 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-white/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-[24rem] w-[24rem] rounded-full bg-white/5"
        />

        <div className="relative text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-white/70">
          Assistente institucional
        </div>

        <div className="relative max-w-lg">
          <h2 className="font-serif text-[2.75rem] font-medium leading-[1.1] tracking-tight">
            As respostas vêm dos documentos oficiais. Nada além deles.
          </h2>
          <p className="mt-6 text-[1.0625rem] leading-relaxed text-white/80">
            Pergunte sobre provas, comunicados, prazos e eventos em linguagem natural. Cada
            resposta mostra de qual documento saiu — e o que você vê depende de quem você é.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
          {[
            ['Fundamentado', 'Só documentos oficiais'],
            ['Com fonte', 'Citação em toda resposta'],
            ['Por perfil', 'Aluno, professor, gestão'],
          ].map(([term, description]) => (
            <div key={term}>
              <dt className="text-[0.875rem] font-bold">{term}</dt>
              <dd className="mt-1 text-[0.8125rem] leading-snug text-white/70">{description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
