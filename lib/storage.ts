import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { envSecret, envText } from '@/lib/env';

/**
 * Guarda o arquivo original para que o chat possa oferecer o PDF da fonte.
 *
 * Dois drivers, escolhidos por ambiente:
 *  - Supabase Storage, quando as credenciais existem (obrigatório na Vercel,
 *    cujo sistema de arquivos é somente leitura fora de /tmp);
 *  - disco local, para rodar o protótipo sem configurar bucket nenhum.
 */

const LOCAL_ROOT = resolve(process.cwd(), 'storage');
const BUCKET = envText('SUPABASE_STORAGE_BUCKET', 'documentos');

function supabaseConfig() {
  const url = envSecret('SUPABASE_URL');
  const key = envSecret('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

export function storageDriver(): 'supabase' | 'local' {
  return supabaseConfig() ? 'supabase' : 'local';
}

export async function putObject(
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const config = supabaseConfig();

  if (config) {
    const response = await fetch(
      `${config.url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.key}`,
          'Content-Type': contentType || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: new Uint8Array(data),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Falha ao enviar para o Supabase Storage (${response.status}): ${await response.text()}`,
      );
    }
    return path;
  }

  const target = join(LOCAL_ROOT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  return path;
}

export async function getObject(path: string): Promise<Buffer> {
  const config = supabaseConfig();

  if (config) {
    const response = await fetch(
      `${config.url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
      { headers: { Authorization: `Bearer ${config.key}` } },
    );
    if (!response.ok) throw new Error(`Arquivo não encontrado no storage: ${path}`);
    return Buffer.from(await response.arrayBuffer());
  }

  const target = join(LOCAL_ROOT, path);
  // Barreira contra path traversal vindo de um storagePath adulterado no banco.
  if (!resolve(target).startsWith(LOCAL_ROOT)) {
    throw new Error('Caminho de arquivo inválido.');
  }
  return readFile(target);
}

/**
 * Remove o arquivo original.
 *
 * Falhar aqui não pode impedir a exclusão do documento: um arquivo órfão no
 * bucket é lixo barato, enquanto um registro que a administração mandou apagar
 * e continuou respondendo no chat é um problema de verdade. Por isso devolve
 * um booleano em vez de estourar.
 */
export async function deleteObject(path: string): Promise<boolean> {
  const config = supabaseConfig();

  try {
    if (config) {
      const response = await fetch(
        `${config.url}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${config.key}` } },
      );
      return response.ok;
    }

    await rm(join(LOCAL_ROOT, path), { force: true });
    return true;
  } catch (error) {
    console.warn('Não foi possível remover o arquivo do storage:', path, error);
    return false;
  }
}
