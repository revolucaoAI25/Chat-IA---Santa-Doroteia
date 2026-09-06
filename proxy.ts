import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Primeira barreira: manda quem não tem cookie para o login antes de a página
 * renderizar. Não é a autorização de verdade — este proxy roda no edge e não
 * verifica a assinatura do token. Quem decide é `getSession()` no servidor e o
 * filtro de visibilidade nas consultas; aqui só evitamos renderizar telas
 * autenticadas para quem claramente não está logado.
 */
export default function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*', '/admin/:path*', '/perfil/:path*'],
};
