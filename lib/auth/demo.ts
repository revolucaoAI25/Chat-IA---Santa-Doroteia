/**
 * Acesso rápido aos perfis de demonstração (entrar como aluno ou professor sem
 * digitar senha), usado para apresentar o protótipo.
 *
 * É um desvio deliberado da autenticação, então precisa estar explicitamente
 * ligado: em produção só funciona com ENABLE_DEMO_LOGIN=true.
 */
export function demoLoginEnabled(): boolean {
  if (process.env.ENABLE_DEMO_LOGIN === 'true') return true;
  if (process.env.ENABLE_DEMO_LOGIN === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}
