import { envFlag } from '@/lib/env';

/**
 * Acesso rápido aos perfis de demonstração (entrar como aluno ou professor sem
 * digitar senha), usado para apresentar o protótipo.
 *
 * É um desvio deliberado da autenticação, então precisa estar explicitamente
 * ligado: em produção só funciona com ENABLE_DEMO_LOGIN=true.
 *
 * `envFlag` trata a variável vazia como não definida — e aqui isso é o
 * comportamento seguro: em produção, cair no padrão significa continuar
 * desligado.
 */
export function demoLoginEnabled(): boolean {
  const flag = envFlag('ENABLE_DEMO_LOGIN');
  if (flag !== undefined) return flag;
  return process.env.NODE_ENV !== 'production';
}
