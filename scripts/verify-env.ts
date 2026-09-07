/**
 * Confere que variável de ambiente **vazia** cai no padrão.
 *
 * Este arquivo existe por causa de um bug real em produção: as variáveis
 * opcionais de modelo foram criadas na Vercel com o campo em branco — o gesto
 * natural de quem segue uma lista de nomes — e `process.env.X ?? padrão` não
 * protege contra isso, porque `??` só cai no padrão para `null`/`undefined`.
 * O resultado foi `model: ''` na chamada da OpenAI e `400 — you must provide a
 * model parameter` em toda ingestão.
 *
 * Os casos numéricos são piores, porque falham em silêncio: `Number('')` é
 * zero, não `NaN`. Retenção zero faz todo documento nascer vencido; limite de
 * perguntas zero tranca o chat da escola inteira. Nenhum dos dois dá erro.
 *
 * Uso: `npx tsx scripts/verify-env.ts`
 */

// Sem import estático de propósito: os módulos sob teste leem process.env na
// avaliação, então precisam ser importados DEPOIS de o ambiente ser montado.
export {};

const CHECKS: Array<[string, () => boolean]> = [];

function check(nome: string, teste: () => boolean) {
  CHECKS.push([nome, teste]);
}

/** Roda com a variável num estado específico e devolve o que o módulo leu. */
async function comEnv<T>(vars: Record<string, string | undefined>, ler: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await ler();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const { envText, envNumber, envFlag, envSecret } = await import('@/lib/env');

/* -------------------------------------------------------------- envText -- */

check('vazio cai no padrão', () =>
  process.env.__T === undefined && envText('__T', 'padrao') === 'padrao');

check('string vazia cai no padrão (o bug de produção)', () => {
  process.env.__T = '';
  const ok = envText('__T', 'gpt-4.1') === 'gpt-4.1';
  delete process.env.__T;
  return ok;
});

check('só espaços cai no padrão', () => {
  process.env.__T = '   ';
  const ok = envText('__T', 'gpt-4.1') === 'gpt-4.1';
  delete process.env.__T;
  return ok;
});

check('valor de verdade é respeitado, e vem sem espaços nas bordas', () => {
  process.env.__T = '  gpt-4o-mini  ';
  const ok = envText('__T', 'gpt-4.1') === 'gpt-4o-mini';
  delete process.env.__T;
  return ok;
});

/* ------------------------------------------------------------ envNumber -- */

check('número vazio NÃO vira zero', () => {
  process.env.__N = '';
  const ok = envNumber('__N', 12) === 12;
  delete process.env.__N;
  return ok;
});

check('zero explícito também cai no padrão', () => {
  process.env.__N = '0';
  const ok = envNumber('__N', 20) === 20;
  delete process.env.__N;
  return ok;
});

check('texto não numérico cai no padrão', () => {
  process.env.__N = 'doze';
  const ok = envNumber('__N', 12) === 12;
  delete process.env.__N;
  return ok;
});

check('número válido é respeitado', () => {
  process.env.__N = '30';
  const ok = envNumber('__N', 12) === 30;
  delete process.env.__N;
  return ok;
});

/* ------------------------------------------------- envFlag / envSecret --- */

check('flag vazia é "não definida", não "falsa"', () => {
  process.env.__F = '';
  const ok = envFlag('__F') === undefined;
  delete process.env.__F;
  return ok;
});

check('segredo vazio é indistinguível de ausente', () => {
  process.env.__S = '';
  const ok = envSecret('__S') === undefined;
  delete process.env.__S;
  return ok;
});

/* ----------------------------------------- os modelos, de ponta a ponta -- */

const modelos = await comEnv(
  {
    OPENAI_CHAT_MODEL: '',
    OPENAI_PLANNER_MODEL: '',
    OPENAI_EXTRACTION_MODEL: '',
    OPENAI_VISION_MODEL: '',
    OPENAI_EMBEDDING_MODEL: '',
    OPENAI_API_KEY: 'sk-teste',
  },
  async () => {
    const { AI_MODELS } = await import('@/lib/ai/provider');
    return AI_MODELS;
  },
);

check('nenhum modelo fica vazio quando a variável está em branco', () =>
  Object.values(modelos).every((m) => typeof m === 'string' && m.trim().length > 0));

/* ------------------------------------------------------------ resultado -- */

let falhas = 0;
for (const [nome, teste] of CHECKS) {
  let ok = false;
  try {
    ok = teste();
  } catch {
    ok = false;
  }
  console.log(ok ? '  ok   ' : ' FALHA ', nome);
  if (!ok) falhas++;
}

console.log(
  falhas === 0
    ? '\nConfiguração: todas as verificações passaram.'
    : `\n${falhas} verificação(ões) falharam.`,
);
process.exit(falhas === 0 ? 0 : 1);
