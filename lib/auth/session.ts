import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role, Segment } from '@/lib/db/schema';

export const SESSION_COOKIE = 'sd_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas — um turno escolar com folga.

/**
 * Tudo que a aplicação precisa saber sobre quem está falando, sem ida ao banco.
 * É este objeto que define, ao mesmo tempo, o recorte de acesso aos documentos
 * e o contexto que vai no prompt do assistente.
 */
export interface SessionUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  matricula: string;
  role: Role;
  segment: Segment | null;
  serie: string | null;
  turma: string | null;
  extraSeries: string[];
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET ausente ou curta demais (mínimo 32 caracteres). Gere uma com: openssl rand -base64 32',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user: user as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return (payload.user as SessionUser) ?? null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Sessão atual, ou null. Use em páginas que tratam o caso anônimo. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

/** Sessão atual, lançando quando não há — para rotas já protegidas por middleware. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'coordenacao';
}
