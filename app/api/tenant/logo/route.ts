import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { getObject } from '@/lib/storage';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * Serve o logo do tenant a partir do storage.
 *
 * Existe porque os dois drivers precisam funcionar igual: no disco local não há
 * URL pública, e no Supabase o bucket é privado. A mesma `logoUrl`
 * (`/api/tenant/logo?v=…`) vale nos dois casos, e o `v` muda a cada troca de
 * arquivo, invalidando o cache do navegador.
 *
 * **Não exige sessão.** A tela de login precisa do logo, e ali ninguém está
 * autenticado — exigir sessão faria a escola nunca ver a própria marca na
 * primeira tela. Um logo institucional é público por natureza; o que é privado
 * são os documentos, servidos por outra rota, essa sim autenticada.
 */
export async function GET(request: Request) {
  const version = new URL(request.url).searchParams.get('v');
  if (!version || !/^[0-9a-f]{6,32}$/.test(version)) {
    return new NextResponse(null, { status: 404 });
  }

  // Com sessão, o tenant é o de quem está logado. Sem sessão (tela de login),
  // cai no único tenant da instalação.
  const session = await getSession();
  const tenant = session
    ? await db.query.tenants.findFirst({
        where: eq(tenants.id, session.tenantId),
        columns: { id: true, logoUrl: true },
      })
    : await db.query.tenants.findFirst({
        columns: { id: true, logoUrl: true },
        orderBy: asc(tenants.createdAt),
      });

  if (!tenant?.logoUrl) return new NextResponse(null, { status: 404 });

  // O caminho é reconstruído a partir do tenant e do parâmetro validado —
  // nunca vem de entrada livre.
  for (const extension of Object.keys(CONTENT_TYPES)) {
    try {
      const file = await getObject(`${tenant.id}/branding/logo-${version}.${extension}`);
      return new Response(new Uint8Array(file), {
        headers: {
          'Content-Type': CONTENT_TYPES[extension],
          // Imutável: uma troca de logo gera outro `v`.
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      // Extensão errada; tenta a próxima.
    }
  }

  return new NextResponse(null, { status: 404 });
}
