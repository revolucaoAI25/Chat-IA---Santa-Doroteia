import { normalizeDate } from '@/lib/ingest/classify';

/**
 * As notações de data que os documentos do colégio realmente usam.
 *
 * Os arquivos não vêm padronizados: cada secretaria escreve a data de um jeito,
 * e o que sai de OCR vem com a linha inteira do cabeçalho colada. Cada caso
 * abaixo é um formato que já apareceu ou que o prompt promete aceitar — e os
 * `null` são igualmente importantes: um palpite errado aqui vira a data do
 * documento, e a data do documento é o que decide qual comunicado o assistente
 * trata como o mais recente.
 *
 * Não precisa de banco nem de chave de API; roda junto de `npm run verify`.
 */
const CASOS: [string | null, string | null][] = [
  // Já normalizada — o caminho comum.
  ['2026-10-08', '2026-10-08'],
  ['2026/10/8', '2026-10-08'],

  // Numérica, sempre na ordem brasileira.
  ['08/10/2026', '2026-10-08'],
  ['08-10-2026', '2026-10-08'],
  ['8.10.26', '2026-10-08'],
  ['03/04/2026', '2026-04-03'],

  // Mês por extenso ou abreviado.
  ['8 de outubro de 2026', '2026-10-08'],
  ['12 de março de 2026', '2026-03-12'],
  ['08-out-2026', '2026-10-08'],
  ['8 out 2026', '2026-10-08'],

  // Só mês e ano: assume o dia 1º.
  ['OUT/2026', '2026-10-01'],
  ['outubro de 2026', '2026-10-01'],
  ['2026-10', '2026-10-01'],

  // A linha inteira do cabeçalho, que é o que o modelo devolve quando o
  // documento não tem diagramação.
  ['Belo Horizonte, 08 de outubro de 2026', '2026-10-08'],
  ['Belo Horizonte, 8 de outubro de 2026.', '2026-10-08'],
  ['quinta-feira, 12/11/2026', '2026-11-12'],
  ['Comunicado nº 254 — 03/04/2026', '2026-04-03'],
  ['Emitido em 2026-10-08.', '2026-10-08'],

  // Nada que dê para aproveitar: null, e a administração corrige na tela.
  ['31/02/2026', null],
  ['2026-13-01', null],
  ['0/0/0', null],
  ['sem data', null],
  ['nº 254', null],
  ['', null],
  [null, null],
];

let failures = 0;

for (const [input, expected] of CASOS) {
  const got = normalizeDate(input);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok  ' : ' FALHA'}  ${JSON.stringify(input)} → ${got}${
      ok ? '' : ` (esperado ${expected})`
    }`,
  );
}

console.log(
  failures === 0
    ? '\nDatas do cabeçalho: todas as verificações passaram.\n'
    : `\nDatas do cabeçalho: ${failures} falha(s).\n`,
);
process.exit(failures === 0 ? 0 : 1);
