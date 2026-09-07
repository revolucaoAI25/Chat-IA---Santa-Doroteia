import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerText } from '@/components/answer-text';
import { usedSources, type Citation } from '@/lib/rag/answer';

/**
 * Confere o renderizador de markdown do chat e o recorte das fontes.
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

/* -------------------------------------------------------------------------- */

/**
 * O recorte das fontes.
 *
 * A busca traz muito mais documento do que a resposta usa — de propósito, para
 * não perder o certo. Quem decide o que aparece embaixo da resposta são as
 * marcas [n] que o modelo escreveu. Errar aqui tem dois preços: mostrar fonte
 * que não foi usada (a parede de comunicados que enterrava a conversa) ou
 * renumerar torto, e aí o botão [2] abre o documento errado — num sistema cuja
 * promessa é justamente poder conferir.
 */
const fonte = (id: string, title: string): Citation => ({
  documentId: id,
  title,
  type: 'comunicado',
  docNumber: null,
  page: null,
  excerpt: '',
});

const TODAS = [
  fonte('a', 'Comunicado A'),
  fonte('b', 'Comunicado B'),
  fonte('c', 'Comunicado C'),
  fonte('d', 'Comunicado D'),
];

const usadas = usedSources('A prova é dia 9 [3]. O conteúdo está no anexo [1].', TODAS);
const juntas = usedSources('Vale para as duas etapas [2][4].', TODAS);
const virgula = usedSources('Confira nos dois comunicados [2, 4].', TODAS);
const semMarca = usedSources('Não encontrei nada sobre isso.', TODAS);
const inventada = usedSources('Segundo o comunicado [9], a aula foi adiada.', TODAS);

Object.assign(CHECKS, {
  'só as fontes citadas entram na lista':
    usadas.citations.length === 2 &&
    usadas.citations[0].documentId === 'c' &&
    usadas.citations[1].documentId === 'a',
  'a numeração é reescrita na ordem em que aparece':
    usadas.answer === 'A prova é dia 9 [1]. O conteúdo está no anexo [2].',
  'duas marcas seguidas continuam apontando certo':
    juntas.answer === 'Vale para as duas etapas [1][2].' &&
    juntas.citations.map((c) => c.documentId).join() === 'b,d',
  '[2, 4] vira [1][2], que é o que a tela sabe renderizar':
    virgula.answer === 'Confira nos dois comunicados [1][2].' && virgula.citations.length === 2,
  'resposta sem nenhuma marca mostra todas as fontes':
    semMarca.citations.length === TODAS.length && semMarca.answer.includes('Não encontrei'),
  'número inventado pelo modelo não cria fonte nem sobra no texto':
    inventada.citations.length === TODAS.length &&
    !inventada.answer.includes('[9]'),
});

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
