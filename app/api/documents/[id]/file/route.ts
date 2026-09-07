import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { documentVisibilityFilter } from '@/lib/rag/access';
import { getObject } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Entrega o arquivo original de um documento citado no chat.
 *
 * O mesmo filtro de visibilidade da busca é reaplicado aqui: conhecer o id de
 * um documento não dá acesso a ele. Sem isso, o link de uma citação vazaria o
 * PDF para quem não pode vê-lo.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 });
  }

  const rows = await db.execute<{
    title: string;
    storage_path: string | null;
    mime_type: string | null;
    source_kind: string;
  }>(sql`
    SELECT d.title, d.storage_path, d.mime_type, d.source_kind
    FROM documents d
    WHERE d.id = ${id} AND ${documentVisibilityFilter(user, 'd')}
    LIMIT 1
  `);

  const document = [...rows][0];
  // 404 e não 403: para quem não tem acesso, o documento simplesmente não existe.
  if (!document) {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  }

  if (!document.storage_path) {
    return NextResponse.json(
      {
        error:
          document.source_kind === 'seed'
            ? 'Este é um documento de demonstração e não possui arquivo original. Suba um PDF pela Administração para ver o download real.'
            : 'Arquivo original indisponível.',
      },
      { status: 404 },
    );
  }

  /*
   * `inline` por padrão, para o painel de fontes conseguir pré-visualizar o PDF
   * num iframe. Com `?download=1` o navegador salva em vez de abrir — é o botão
   * "Baixar" do painel.
   */
  const download = new URL(request.url).searchParams.get('download') === '1';
  const extension = document.mime_type === 'application/pdf' ? '.pdf' : '';
  const fileName = `${document.title}${extension}`;

  try {
    const file = await getObject(document.storage_path);
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': document.mime_type || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('Falha ao ler arquivo do storage:', error);
    return NextResponse.json({ error: 'Arquivo indisponível.' }, { status: 404 });
  }
}
