'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { segment as segmentEnum, users, type Segment } from '@/lib/db/schema';
import { requireSession, isAdmin } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { SERIES } from '@/lib/taxonomy';
import { currentAnoLetivo } from '@/lib/academic-calendar';
import { userRole, type Role } from '@/lib/db/schema';
import { and } from 'drizzle-orm';

const SERIE_BY_VALUE = new Map(SERIES.map((s) => [s.value, s]));

export interface UserState {
  error?: string;
  saved?: string;
}

export interface CreateUserState {
  error?: string;
  /** Nome de quem acabou de ser criado, para a confirmação na tela. */
  created?: string;
}

/**
 * Cadastra uma pessoa.
 *
 * É o mínimo para a instalação sair do papel: a rota de instalação cria só o
 * administrador, então sem esta tela não existe um único aluno ou professor
 * para testar as respostas. O cadastro em massa por planilha está desenhado em
 * docs/cadastro-em-massa.md e reaproveita estas mesmas validações.
 */
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requireSession();
  if (!isAdmin(actor)) return { error: 'Apenas a administração pode cadastrar usuários.' };

  const name = String(formData.get('name') ?? '').trim();
  const matricula = String(formData.get('matricula') ?? '').trim().toUpperCase();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? '');
  const password = String(formData.get('password') ?? '');
  const serie = String(formData.get('serie') ?? '');
  const turma = String(formData.get('turma') ?? '').trim().slice(0, 10);

  if (name.length < 2) return { error: 'Informe o nome completo.' };
  if (!/^[A-Z0-9._-]{2,30}$/.test(matricula)) {
    return { error: 'A matrícula deve ter de 2 a 30 caracteres, sem espaços ou acentos.' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'E-mail inválido.' };
  if (!(userRole.enumValues as readonly string[]).includes(role)) {
    return { error: 'Perfil inválido.' };
  }
  if (password.length < 8) return { error: 'A senha provisória precisa ter ao menos 8 caracteres.' };
  if (role === 'aluno' && serie && !SERIE_BY_VALUE.has(serie)) return { error: 'Série inválida.' };

  // A matrícula e o e-mail são únicos por escola. Conferimos antes para dar uma
  // mensagem útil, em vez de deixar estourar a violação de índice.
  const clash = await db.query.users.findFirst({
    where: and(eq(users.tenantId, actor.tenantId), eq(users.matricula, matricula)),
  });
  if (clash) return { error: `A matrícula ${matricula} já está cadastrada.` };

  const emailClash = await db.query.users.findFirst({
    where: and(eq(users.tenantId, actor.tenantId), eq(users.email, email)),
  });
  if (emailClash) return { error: `O e-mail ${email} já está cadastrado.` };

  await db.insert(users).values({
    tenantId: actor.tenantId,
    name,
    matricula,
    email,
    role: role as Role,
    passwordHash: await hashPassword(password),
    serie: role === 'aluno' && serie ? serie : null,
    segment: role === 'aluno' && serie ? SERIE_BY_VALUE.get(serie)!.segment : null,
    // Registrar o ano letivo junto é o que faz a série avançar sozinha depois.
    serieAnoLetivo: role === 'aluno' && serie ? currentAnoLetivo() : null,
    turma: role === 'aluno' && turma ? turma : null,
  });

  revalidatePath('/admin');
  return { created: name };
}

/**
 * Atualiza o contexto acadêmico de uma pessoa. Só a administração chama isto —
 * é o contraponto da tela de perfil, que é somente leitura.
 */
export async function updateUserContext(
  _prev: UserState,
  formData: FormData,
): Promise<UserState> {
  const actor = await requireSession();
  if (!isAdmin(actor)) return { error: 'Apenas a administração pode alterar cadastros.' };

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: 'Usuário não informado.' };

  // O alvo é sempre relido, com o tenant conferido: um id de outra escola não
  // pode ser editado por este administrador.
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.tenantId !== actor.tenantId) {
    return { error: 'Usuário não encontrado.' };
  }

  const patch: Partial<typeof users.$inferInsert> = {};

  if (target.role === 'aluno') {
    const serie = String(formData.get('serie') ?? '');
    if (serie && !SERIE_BY_VALUE.has(serie)) return { error: 'Série inválida.' };

    patch.serie = serie || null;
    // O segmento acompanha a série: são o mesmo fato, e deixá-los divergir
    // criaria um recorte de acesso incoerente.
    patch.segment = serie ? SERIE_BY_VALUE.get(serie)!.segment : null;
    patch.turma = String(formData.get('turma') ?? '').trim().slice(0, 10) || null;

    // Fixa o ano letivo desta série: é a base do avanço automático. Sem isto,
    // corrigir a série de alguém em 2027 faria o sistema avançá-la de novo.
    patch.serieAnoLetivo = serie ? currentAnoLetivo() : null;

    patch.extraSeries = formData
      .getAll('extraSeries')
      .map(String)
      .filter((s) => SERIE_BY_VALUE.has(s));
  } else {
    patch.disciplinas = formData
      .getAll('disciplinas')
      .map((d) => String(d).trim())
      .filter((d) => d.length > 0 && d.length <= 60)
      .slice(0, 15);

    patch.seriesTaught = formData
      .getAll('seriesTaught')
      .map(String)
      .filter((s) => SERIE_BY_VALUE.has(s));

    patch.segmentsTaught = formData
      .getAll('segmentsTaught')
      .map(String)
      .filter((s): s is Segment => (segmentEnum.enumValues as readonly string[]).includes(s));
  }

  await db.update(users).set(patch).where(eq(users.id, userId));

  revalidatePath('/admin');
  return { saved: userId };
}

/** Ativa ou desativa o acesso de uma pessoa. */
export async function toggleUserActive(userId: string, active: boolean): Promise<void> {
  const actor = await requireSession();
  if (!isAdmin(actor)) throw new Error('Sem permissão.');

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.tenantId !== actor.tenantId) throw new Error('Usuário não encontrado.');

  // Desativar a si mesmo tranca o administrador para fora do sistema.
  if (target.id === actor.id) throw new Error('Você não pode desativar o próprio acesso.');

  await db.update(users).set({ active }).where(eq(users.id, userId));
  revalidatePath('/admin');
}
