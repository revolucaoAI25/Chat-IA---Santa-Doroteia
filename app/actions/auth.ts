'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/session';
import { demoLoginEnabled } from '@/lib/auth/demo';

export interface LoginState {
  error?: string;
}

/**
 * Login por matrícula, como na tela oficial ("A matrícula é o login").
 * O e-mail também é aceito, porque é o identificador que os professores
 * lembram — os dois caminhos conferem a mesma senha.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier || !password) {
    return { error: 'Informe a matrícula e a senha.' };
  }

  const isEmail = identifier.includes('@');
  const user = await db.query.users.findFirst({
    where: isEmail
      ? eq(users.email, identifier.toLowerCase())
      : eq(users.matricula, identifier.toUpperCase()),
  });

  // Mensagem única para credencial errada e usuário inexistente: não revela
  // quais matrículas existem.
  const genericError = { error: 'Matrícula ou senha incorreta.' };

  if (!user || !user.active) return genericError;
  if (!(await verifyPassword(password, user.passwordHash))) return genericError;

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
  await setSessionCookie(user.id);

  redirect('/chat');
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

/**
 * Entra num perfil de demonstração SEM SENHA, para trocar rapidamente entre
 * aluno e professor durante a apresentação do protótipo.
 *
 * A verificação é feita aqui no servidor, e não só na interface: esconder os
 * cartões não bastaria, porque a própria ação é um endpoint chamável.
 */
export async function loginAsDemo(matricula: string): Promise<void> {
  if (!demoLoginEnabled()) {
    throw new Error('Acesso rápido de demonstração desabilitado neste ambiente.');
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.matricula, matricula), eq(users.active, true)),
  });
  if (!user) redirect('/login?error=perfil-nao-encontrado');

  await setSessionCookie(user.id);
  redirect('/chat');
}
