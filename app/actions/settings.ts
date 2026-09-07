'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, type TenantSettings } from '@/lib/db/schema';
import { requireSession, isAdmin } from '@/lib/auth/session';
import { DEFAULT_ETAPA_ENDS, DEFAULT_YEAR_START, TIMEZONES } from '@/lib/academic-calendar';

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

const MONTH_DAY = /^\d{2}-\d{2}$/;
const MAX_CONTEXT = 2000;

/**
 * Configurações acadêmicas do colégio.
 *
 * Ficam no banco porque são conhecimento da secretaria: corrigir a data de fim
 * de uma etapa não pode depender de um deploy.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireSession();
  if (!isAdmin(user)) return { error: 'Apenas a administração pode alterar as configurações.' };

  const yearStart = String(formData.get('yearStart') ?? '').trim() || DEFAULT_YEAR_START;
  if (!MONTH_DAY.test(yearStart)) {
    return { error: 'Início do ano letivo inválido. Use o formato MM-DD.' };
  }

  const ends: string[] = [];
  for (const index of [0, 1, 2]) {
    const value = String(formData.get(`etapaEnd${index}`) ?? '').trim() || DEFAULT_ETAPA_ENDS[index];
    if (!MONTH_DAY.test(value)) {
      return { error: `Fim da ${index + 1}ª etapa inválido. Use o formato MM-DD.` };
    }
    ends.push(value);
  }

  // As etapas são um intervalo contínuo: fora de ordem, uma delas ficaria
  // vazia e a etapa vigente passaria a ser calculada errado o ano todo.
  if (!(yearStart < ends[0] && ends[0] < ends[1] && ends[1] < ends[2])) {
    return {
      error:
        'As datas precisam estar em ordem crescente: início do ano < fim da 1ª < fim da 2ª < fim da 3ª etapa.',
    };
  }

  const timezone = String(formData.get('timezone') ?? '');
  if (timezone && !TIMEZONES.includes(timezone)) {
    return { error: 'Fuso horário inválido.' };
  }

  const institutionalContext = String(formData.get('institutionalContext') ?? '')
    .trim()
    .slice(0, MAX_CONTEXT);

  const settings: TenantSettings = {
    yearStart,
    etapaEnds: [ends[0], ends[1], ends[2]],
    timezone: timezone || undefined,
    institutionalContext: institutionalContext || undefined,
  };

  await db
    .update(tenants)
    .set({ settings, updatedAt: new Date() })
    .where(eq(tenants.id, user.tenantId));

  revalidatePath('/', 'layout');
  return { saved: true };
}
