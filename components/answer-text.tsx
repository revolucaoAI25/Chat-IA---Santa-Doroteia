import { Fragment, type ReactNode } from 'react';

/**
 * Renderizador do subconjunto de markdown que o assistente realmente produz:
 * parágrafos, listas, negrito e as marcas de citação [1].
 *
 * Escrito à mão em vez de trazer uma biblioteca de markdown por dois motivos:
 * o conjunto é pequeno e fechado, e a saída são elementos React — nunca
 * `dangerouslySetInnerHTML` —, então texto do modelo não vira HTML executável.
 */
export function AnswerText({
  content,
  onCitationClick,
}: {
  content: string;
  onCitationClick?: (index: number) => void;
}) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3 text-[0.9375rem] leading-[1.7] text-ink">
      {blocks.map((block, i) =>
        block.type === 'list' ? (
          <ul key={i} className="space-y-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-navy/45"
                />
                <span>{renderInline(item, onCitationClick)}</span>
              </li>
            ))}
          </ul>
        ) : block.type === 'ordered' ? (
          <ol key={i} className="space-y-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="mt-px shrink-0 text-[0.8125rem] font-bold text-navy">
                  {j + 1}.
                </span>
                <span>{renderInline(item, onCitationClick)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p key={i}>{renderInline(block.text, onCitationClick)}</p>
        ),
      )}
    </div>
  );
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'ordered'; items: string[] };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  let ordered: string[] | null = null;
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: 'list', items: list });
      list = null;
    }
    if (ordered) {
      blocks.push({ type: 'ordered', items: ordered });
      ordered = null;
    }
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flush();
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    // O prompt pede para não usar cabeçalho, mas se vier um, vira parágrafo.
    const heading = line.match(/^#{1,6}\s+(.*)$/);

    if (bullet) {
      if (paragraph.length || ordered) flush();
      (list ??= []).push(bullet[1]);
    } else if (numbered) {
      if (paragraph.length || list) flush();
      (ordered ??= []).push(numbered[1]);
    } else if (list || ordered) {
      // Continuação recuada do item anterior.
      const target = list ?? ordered!;
      target[target.length - 1] += ` ${line.trim()}`;
    } else {
      paragraph.push(heading ? heading[1] : line.trim());
    }
  }

  flush();
  return blocks;
}

/** Negrito e marcas de citação, preservando a ordem do texto. */
function renderInline(text: string, onCitationClick?: (index: number) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(\d{1,2})\]/g;
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink">
          {match[1]}
        </strong>,
      );
    } else {
      const index = Number(match[2]);
      nodes.push(
        <Fragment key={key++}>
          <button
            type="button"
            onClick={() => onCitationClick?.(index)}
            title={`Ver fonte ${index}`}
            className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-[0.3rem] bg-chip px-1 align-[0.05em] text-[0.6875rem] font-bold text-navy transition-colors hover:bg-navy-soft"
          >
            {index}
          </button>
        </Fragment>,
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
