import { cache } from 'react';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { effectiveSerie } from '@/lib/series-progression';
import type { Role, Segment } from '@/lib/db/schema';

export const SESSION_COOKIE = 'sd_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas — um turno escolar com folga.

/**
 * Tudo que a aplicação precisa saber sobre quem está falando: define ao mesmo
 * tempo o recorte de acesso aos documentos e o contexto que vai no prompt.
 */
export interface SessionUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  matricula: string;
  role: Role;

  /** Série e segmento VIGENTES — já com o avanço automático de ano aplicado. */
  segment: Segment | null;
  serie: string | null;
  turma: string | null;
  extraSeries: string[];

  /** Contexto do professor, definido pela secretaria. */
  disciplinas: string[];
  seriesTaught: string[];
  segmentsTaught: Segment[];

  /** Concluiu o Ensino Médio pelo avanço automático; cadastro pede atenção. */
  concluido: boolean;

  /**
   * Preenchido quando um administrador está vendo o sistema pelos olhos desta
   * pessoa. Tudo o mais na sessão é do usuário visitado — papel, série, acesso —
   * porque é justamente isso que se quer conferir.
   */
  impersonator?: { id: string; name: string };
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

/**
 * O cookie carrega apenas o id.
 *
 * Papel, série e situação ficam no banco e são lidos a cada requisição. Custa
 * uma consulta por chave primária, e em troca desativar alguém ou corrigir a
 * série de um aluno passa a valer na hora — em vez de continuar valendo o que
 * estava no token por até 8 horas.
 */
export async function setSessionCookie(
  userId: string,
  /** Administrador que está "vendo como" — vai no token para o retorno ser possível. */
  impersonatorId?: string,
): Promise<void> {
  const token = await new SignJWT(
    impersonatorId ? { uid: userId, imp: impersonatorId } : { uid: userId },
  )
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

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

/**
 * Sessão atual, ou null.
 *
 * `cache()` deduplica a consulta dentro da mesma requisição: layout, página e
 * rota podem chamar à vontade que o banco é consultado uma vez só.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  let impersonatorId = '';
  try {
    const { payload } = await jwtVerify(token, secretKey());
    userId = String(payload.uid ?? '');
    impersonatorId = payload.imp ? String(payload.imp) : '';
    if (!userId) return null;
  } catch {
    return null;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.active) return null;

  /*
   * "Ver como" é revalidado a cada requisição, não confiado ao token.
   *
   * O token é assinado, então `imp` não pode ser forjado — mas pode envelhecer:
   * o administrador que iniciou a visita pode ter sido desativado ou rebaixado
   * nesse meio-tempo. Quando isso acontece, a sessão inteira cai, e não só a
   * faixa de aviso: continuar navegando como outra pessoa sem ninguém
   * autorizado por trás é exatamente o que não pode acontecer.
   */
  let impersonator: SessionUser['impersonator'];
  if (impersonatorId) {
    const admin = await db.query.users.findFirst({ where: eq(users.id, impersonatorId) });
    const allowed =
      admin &&
      admin.active &&
      admin.tenantId === user.tenantId &&
      (admin.role === 'admin' || admin.role === 'coordenacao');
    if (!allowed) return null;
    impersonator = { id: admin.id, name: admin.name };
  }

  // A série vigente é derivada da data, não lida crua do banco: o cadastro
  // guarda "7º ano em 2026" e o ano seguinte responde 8º ano sozinho.
  const effective = effectiveSerie(user.serie, user.serieAnoLetivo);

  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    matricula: user.matricula,
    role: user.role,
    segment: effective.segment ?? user.segment,
    serie: effective.serie,
    turma: user.turma,
    extraSeries: user.extraSeries,
    disciplinas: user.disciplinas,
    seriesTaught: user.seriesTaught,
    segmentsTaught: user.segmentsTaught,
    concluido: effective.concluido,
    impersonator,
  };
});

/** Sessão atual, lançando quando não há — para rotas já protegidas pelo proxy. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'coordenacao';
}
