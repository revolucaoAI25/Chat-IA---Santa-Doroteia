import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
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
 * Existe porque os dois drivers de storage precisam funcionar igual: no disco
 * local não há URL pública, e no Supabase o bucket é privado. Assim a mesma
 * `logoUrl` (`/api/tenant/logo?v=…`) vale nos dois casos, e o parâmetro `v`
 * muda a cada troca de arquivo, o que invalida o cache do navegador.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return new NextResponse(null, { status: 401 });

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
    columns: { logoUrl: true },
  });

  const version = new URL(request.url).searchParams.get('v');
  if (!tenant?.logoUrl || !version || !/^[0-9a-f]{6,32}$/.test(version)) {
    return new NextResponse(null, { status: 404 });
  }

  // O caminho é reconstruído a partir do tenant da sessão e do parâmetro
  // validado — nunca vem de entrada livre.
  for (const extension of Object.keys(CONTENT_TYPES)) {
    try {
      const file = await getObject(`${user.tenantId}/branding/logo-${version}.${extension}`);
      return new Response(new Uint8Array(file), {
        headers: {
          'Content-Type': CONTENT_TYPES[extension],
          // Imutável: uma troca de logo gera outro `v`.
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      });
    } catch {
      // Extensão errada; tenta a próxima.
    }
  }

  return new NextResponse(null, { status: 404 });
}
