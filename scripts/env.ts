import { createRequire } from 'node:module';

/**
 * Carrega .env.local / .env com exatamente a mesma precedência que o Next usa
 * em runtime, para que os scripts de linha de comando nunca leiam uma
 * configuração diferente da que a aplicação vai ler.
 *
 * `@next/env` é CommonJS e não expõe named exports para o loader ESM, daí o
 * require explícito em vez de `import { loadEnvConfig }`.
 */
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (
    dir: string,
    dev?: boolean,
    logger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  ) => void;
};

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
