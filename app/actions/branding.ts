'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, type Branding } from '@/lib/db/schema';
import { requireSession, isAdmin } from '@/lib/auth/session';
import { FONT_PRESETS } from '@/lib/branding';
import { putObject } from '@/lib/storage';

export interface BrandingState {
  error?: string;
  saved?: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_FIELDS = [
  'primary', 'primaryHover', 'primarySoft',
  'background', 'surface', 'ink', 'accent',
] as const;

const LOGO_MAX_BYTES = 4 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Salva a identidade visual do tenant.
 *
 * Tudo é validado no servidor antes de gravar: as cores viram CSS variables
 * aplicadas na árvore inteira, então aceitar string livre aqui seria aceitar
 * CSS arbitrário vindo de um formulário.
 */
export async function saveBranding(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const user = await requireSession();
  if (!isAdmin(user)) return { error: 'Apenas a administração pode alterar a identidade visual.' };

  const branding: Branding = {};

  for (const field of COLOR_FIELDS) {
    const value = String(formData.get(field) ?? '').trim();
    if (!value) continue;
    if (!HEX.test(value)) return { error: `Cor inválida em "${field}". Use o formato #RRGGBB.` };
    branding[field] = value.toUpperCase();
  }

  const preset = String(formData.get('fontPreset') ?? '');
  if (preset && FONT_PRESETS.some((p) => p.key === preset)) branding.fontPreset = preset;

  const size = Number(formData.get('logoSize'));
  if (Number.isFinite(size)) branding.logoSize = Math.min(240, Math.max(96, Math.round(size)));

  const displayName = String(formData.get('displayName') ?? '').trim().slice(0, 120);

  const patch: Partial<typeof tenants.$inferInsert> = {
    branding,
    updatedAt: new Date(),
  };
  if (displayName) patch.displayName = displayName;

  // Logo é opcional em cada salvamento: sem arquivo novo, o atual permanece.
  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) {
      return { error: 'O logo precisa ser PNG, JPEG, WebP ou SVG.' };
    }
    if (logo.size > LOGO_MAX_BYTES) {
      return { error: 'O logo precisa ter no máximo 4 MB.' };
    }

    const buffer = Buffer.from(await logo.arrayBuffer());
    const checksum = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const extension = logo.type.split('/')[1].replace('svg+xml', 'svg');
    const path = `${user.tenantId}/branding/logo-${checksum}.${extension}`;

    await putObject(path, buffer, logo.type);
    patch.logoUrl = `/api/tenant/logo?v=${checksum}`;
  }

  if (formData.get('removeLogo') === 'true') {
    patch.logoUrl = null;
  }

  await db.update(tenants).set(patch).where(eq(tenants.id, user.tenantId));

  // O branding é lido no layout do grupo (app), então toda tela precisa ser
  // revalidada para repintar.
  revalidatePath('/', 'layout');

  return { saved: true };
}

/** Volta tudo ao tema padrão, sem apagar o logo. */
export async function resetBranding(): Promise<void> {
  const user = await requireSession();
  if (!isAdmin(user)) throw new Error('Sem permissão.');

  await db
    .update(tenants)
    .set({ branding: {}, updatedAt: new Date() })
    .where(eq(tenants.id, user.tenantId));

  revalidatePath('/', 'layout');
}
