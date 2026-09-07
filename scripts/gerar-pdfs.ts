/**
 * Gera os PDFs de exemplo a partir de scripts/documentos-exemplo.ts.
 *
 * Fica FORA do typecheck (ver `exclude` no tsconfig.json) porque depende do
 * playwright, que não é dependência da aplicação — só de quem regenera os
 * exemplos.
 *
 *   npm i -D playwright   (só para gerar; não é dependência da aplicação)
 *   npx tsx scripts/gerar-pdfs.ts
 *
 * Os PDFs já vão versionados em documentos-exemplo/, então isto só precisa
 * rodar de novo se você editar ou acrescentar documentos.
 *
 * O papel timbrado importa para o teste: um PDF só com texto corrido não
 * exercita o classificador do mesmo jeito que um documento com cabeçalho,
 * número, destinatário e assinatura — que é o que a escola realmente publica.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { DOCUMENTOS_EXEMPLO, type DocumentoExemplo } from './documentos-exemplo';

const OUT = 'documentos-exemplo';
await mkdir(OUT, { recursive: true });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Converte o corpo em parágrafos, listas e títulos de seção. */
function renderBody(corpo: string): string {
  const blocks: string[] = [];
  let list: string[] | null = null;

  const flush = () => {
    if (list) {
      blocks.push(`<ul>${list.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
      list = null;
    }
  };

  for (const raw of corpo.split('\n')) {
    const line = raw.trim();

    if (!line) {
      flush();
      continue;
    }

    if (line.startsWith('- ')) {
      (list ??= []).push(line.slice(2));
      continue;
    }

    flush();

    // Linha inteiramente em maiúsculas é um título de seção.
    const isHeading = line === line.toUpperCase() && line.length < 70 && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line);
    blocks.push(
      isHeading ? `<h2>${escapeHtml(line)}</h2>` : `<p>${escapeHtml(line)}</p>`,
    );
  }

  flush();
  return blocks.join('\n');
}

function html(doc: DocumentoExemplo): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 20mm 20mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10.5pt; line-height: 1.55; color: #111; margin: 0;
  }
  header {
    display: flex; align-items: center; gap: 14px;
    border-bottom: 2px solid #0F3B85; padding-bottom: 10px; margin-bottom: 4px;
  }
  .crest { width: 52px; height: 52px; flex: none; }
  .school { line-height: 1.15; }
  .school .kicker { font-size: 7pt; letter-spacing: .14em; text-transform: uppercase; color: #0F3B85; }
  .school .name { font-size: 15pt; font-weight: bold; color: #0F3B85; }
  .school .city { font-size: 8pt; font-style: italic; color: #444; }
  .meta {
    margin-left: auto; text-align: right; font-family: Arial, Helvetica, sans-serif;
    font-size: 7.5pt; color: #444; line-height: 1.5;
  }
  .meta strong { color: #0F3B85; font-size: 9pt; }
  .restrito {
    margin-top: 10px; padding: 5px 9px; border: 1px solid #A3271F;
    background: #F6E3E1; color: #A3271F;
    font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt;
    font-weight: bold; letter-spacing: .06em; text-transform: uppercase;
  }
  h1 { font-size: 15pt; margin: 16px 0 2px; color: #111; line-height: 1.25; }
  .dest {
    font-family: Arial, Helvetica, sans-serif; font-size: 8pt;
    color: #555; margin-bottom: 14px;
    border-bottom: 1px solid #DDD; padding-bottom: 8px;
  }
  h2 {
    font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt;
    letter-spacing: .08em; color: #0F3B85; margin: 15px 0 5px;
  }
  p { margin: 0 0 8px; text-align: justify; }
  ul { margin: 0 0 9px; padding-left: 18px; }
  li { margin-bottom: 3px; }
  footer {
    margin-top: 26px; padding-top: 10px; border-top: 1px solid #DDD;
    font-size: 9pt; text-align: center;
  }
  footer .sig { font-weight: bold; }
  footer .addr {
    margin-top: 10px; font-family: Arial, Helvetica, sans-serif;
    font-size: 7pt; color: #777;
  }
</style></head>
<body>
  <header>
    <svg class="crest" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="31" fill="#C9A227"/>
      <circle cx="32" cy="32" r="26" fill="#FDFCF7"/>
      <circle cx="32" cy="32" r="22" fill="#2E6FA8"/>
      <path d="M32 15c-6.4 0-10.8 4.7-10.8 10.3 0 4.3 2.8 7.7 6.9 9.2V41h7.8v-6.5c4.1-1.5 6.9-4.9 6.9-9.2C42.8 19.7 38.4 15 32 15Z" fill="#2F7D46"/>
      <rect x="30.4" y="39" width="3.2" height="9" rx="1.2" fill="#6B4A22"/>
      <path d="M21 48h22" stroke="#C9A227" stroke-width="2.8" stroke-linecap="round"/>
    </svg>
    <div class="school">
      <div class="kicker">Colégio</div>
      <div class="name">Santa Dorotéia</div>
      <div class="city">Belo Horizonte — MG</div>
    </div>
    <div class="meta">
      <strong>${escapeHtml(doc.tipo)} nº ${doc.numero}</strong><br>
      Belo Horizonte<br>
      ${escapeHtml(doc.emitidoEm)}
    </div>
  </header>

  ${doc.restrito ? '<div class="restrito">Circulação interna — corpo docente</div>' : ''}

  <h1>${escapeHtml(doc.titulo)}</h1>
  <div class="dest">Destinatários: ${escapeHtml(doc.destinatario)}</div>

  ${renderBody(doc.corpo)}

  <footer>
    <div class="sig">${escapeHtml(doc.assinatura)}</div>
    <div>Colégio Santa Dorotéia — Belo Horizonte</div>
    <div class="addr">
      Rua Exemplo, 1000 · Belo Horizonte/MG · (31) 0000-0000 · secretaria@santadoroteia.com.br
    </div>
  </footer>
</body></html>`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage();

for (const doc of DOCUMENTOS_EXEMPLO) {
  await page.setContent(html(doc), { waitUntil: 'load' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  const file = `${OUT}/${String(doc.numero)}-${doc.slug.replace(/^\d+-/, '')}.pdf`;
  await writeFile(file, pdf);
  console.log(`  ✓ ${file}  (${(pdf.length / 1024).toFixed(0)} KB) — ${doc.testa}`);
}

await browser.close();
console.log(`\n${DOCUMENTOS_EXEMPLO.length} PDFs em ${OUT}/`);
