import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, users } from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrate';
import { hashPassword } from '@/lib/auth/password';
import { DEFAULT_ETAPA_ENDS, DEFAULT_TIMEZONE, DEFAULT_YEAR_START } from '@/lib/academic-calendar';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Instalação a partir da própria aplicação, para quem não roda nada localmente.
 *
 * Faz o que os scripts `db:migrate` e `db:seed` fariam numa máquina de
 * desenvolvimento: cria o schema e o primeiro administrador. É executado uma
 * vez, logo depois do primeiro deploy.
 *
 * Trancada por `SETUP_TOKEN`. Sem a variável definida, a rota não existe —
 * é o que garante que ela não fique disponível depois da instalação: basta
 * remover a variável na Vercel.
 */

function authorized(request: Request): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) return false;

  const provided = new URL(request.url).searchParams.get('token') ?? '';

  // Comparação em tempo constante, para o token não vazar por tempo de
  // resposta. Os buffers precisam ter o mesmo tamanho.
  const a = Buffer.from(provided.padEnd(expected.length).slice(0, expected.length));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) && provided.length === expected.length;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    // 404 e não 401: sem SETUP_TOKEN configurado, a rota não deve nem se
    // anunciar como existente.
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  }

  const steps: string[] = [];

  try {
    /* 1. Schema ------------------------------------------------------------ */
    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json(
        { error: 'DATABASE_URL não está configurada no projeto da Vercel.' },
        { status: 500 },
      );
    }

    /*
     * As migrações precisam de sessão estável — DDL com vários statements não
     * funciona no pooler de transações (6543).
     *
     * O endereço de instalação deve ser o **Session pooler** (5432 no host
     * `...pooler.supabase.com`), e não a "Direct connection": no plano gratuito
     * do Supabase a conexão direta só responde por IPv6, e a Vercel não fala
     * IPv6 — o pedido nem chega ao banco.
     */
    const migrationUrl = process.env.DATABASE_URL_DIRECT ?? url;
    if (migrationUrl.includes(':6543')) {
      return NextResponse.json(
        {
          error:
            'As migrações precisam de uma conexão em modo sessão (porta 5432). ' +
            'Adicione a variável DATABASE_URL_DIRECT com o "Session pooler" do Supabase ' +
            '(botão Connect → aba Direct connection) e rode de novo.',
        },
        { status: 400 },
      );
    }

    const { applied } = await runMigrations(migrationUrl);
    steps.push(`${applied.length} migração(ões) aplicada(s): ${applied.join(', ')}`);

    /* 2. Tenant ------------------------------------------------------------ */
    const schoolName = process.env.SETUP_SCHOOL_NAME?.trim() || 'Colégio Santa Dorotéia';
    const slug =
      process.env.SETUP_SCHOOL_SLUG?.trim() ||
      schoolName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

    let tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });

    if (!tenant) {
      [tenant] = await db
        .insert(tenants)
        .values({
          slug,
          displayName: schoolName,
          branding: { primary: '#0F3B85', logoSize: 176 },
          settings: {
            yearStart: DEFAULT_YEAR_START,
            etapaEnds: DEFAULT_ETAPA_ENDS,
            timezone: DEFAULT_TIMEZONE,
          },
        })
        .returning();
      steps.push(`Escola criada: ${schoolName}`);
    } else {
      steps.push(`Escola já existia: ${tenant.displayName}`);
    }

    /* 3. Administrador ------------------------------------------------------ */
    const email = process.env.SETUP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SETUP_ADMIN_PASSWORD;
    const name = process.env.SETUP_ADMIN_NAME?.trim() || 'Administrador';
    const matricula = process.env.SETUP_ADMIN_MATRICULA?.trim().toUpperCase() || 'ADM001';

    if (!email || !password) {
      return NextResponse.json(
        {
          ok: false,
          steps,
          error:
            'Schema criado, mas faltam SETUP_ADMIN_EMAIL e SETUP_ADMIN_PASSWORD para criar o ' +
            'administrador. Configure-as e rode de novo.',
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, steps, error: 'A senha do administrador precisa ter ao menos 8 caracteres.' },
        { status: 400 },
      );
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

    if (existing) {
      // Reexecutar a instalação não recria o administrador nem sobrescreve a
      // senha dele — só confirma que existe.
      steps.push(`Administrador já existia: ${email}`);
    } else {
      await db.insert(users).values({
        tenantId: tenant.id,
        matricula,
        email,
        name,
        role: 'admin',
        passwordHash: await hashPassword(password),
      });
      steps.push(`Administrador criado: ${email} (matrícula ${matricula})`);
    }

    return NextResponse.json({
      ok: true,
      steps,
      proximoPasso:
        'Instalação concluída. Entre com a matrícula e a senha do administrador, ' +
        'e REMOVA a variável SETUP_TOKEN da Vercel para fechar esta rota.',
    });
  } catch (error) {
    console.error('Falha na instalação:', error);
    return NextResponse.json(
      {
        ok: false,
        steps,
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      },
      { status: 500 },
    );
  }
}

/** GET explica como usar, sem executar nada. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({
    instrucoes:
      'Envie um POST para esta mesma URL (com o token) para criar o schema e o administrador.',
    variaveisNecessarias: [
      'DATABASE_URL (ou DATABASE_URL_DIRECT, na porta 5432, para as migrações)',
      'SETUP_ADMIN_EMAIL',
      'SETUP_ADMIN_PASSWORD',
    ],
    variaveisOpcionais: [
      'SETUP_ADMIN_NAME',
      'SETUP_ADMIN_MATRICULA (padrão: ADM001)',
      'SETUP_SCHOOL_NAME',
    ],
  });
}
