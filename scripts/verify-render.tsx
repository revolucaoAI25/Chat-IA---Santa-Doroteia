import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerText } from '@/components/answer-text';

/**
 * Confere o renderizador de markdown do chat.
 *
 * O renderizador é escrito à mão (nada de `dangerouslySetInnerHTML`, então
 * texto do modelo nunca vira HTML executável), e o preço disso é que cada
 * construção precisa de um teste. O modo de falha típico não é erro: é
 * asterisco vazando no meio da resposta, que ninguém percebe até um pai
 * reclamar.
 *
 * Uso: `npx tsx scripts/verify-render.tsx`
 */

const AMOSTRA = `**Provas finais**
A sua prova de **matemática** é na **quarta-feira, 9 de dezembro de 2026, às 7h10** [1].

**Recuperação**
Os conteúdos são [2]:
- Números inteiros e racionais
- Equações do 1º grau
- Razão e proporção

O plantão de dúvidas é *opcional*, mas recomendado [2].

1. Chegue com 20 minutos de antecedência
2. Leve caneta azul ou preta`;

const html = renderToStaticMarkup(<AnswerText content={AMOSTRA} />);

const CHECKS: Record<string, boolean> = {
  'linha só de negrito vira título de seção':
    html.includes('uppercase') && html.includes('Provas finais'),
  'negrito no meio da frase vira <strong>': html.includes('<strong'),
  'itálico vira <em>': html.includes('<em>opcional</em>'),
  'lista com marcador vira <ul>': html.includes('<ul'),
  'lista numerada vira <ol>': html.includes('<ol'),
  'cada [n] vira um botão de fonte': (html.match(/Ver fonte/g) ?? []).length === 3,
  'nenhum asterisco solto sobra no texto': !html.includes('*'),
  'nada de HTML cru do modelo': !html.includes('<script'),
};

let falhas = 0;
for (const [nome, ok] of Object.entries(CHECKS)) {
  console.log(ok ? '  ok   ' : ' FALHA ', nome);
  if (!ok) falhas++;
}

console.log(
  falhas === 0
    ? '\nRenderização do chat: todas as verificações passaram.'
    : `\n${falhas} verificação(ões) falharam.`,
);
process.exit(falhas === 0 ? 0 : 1);
