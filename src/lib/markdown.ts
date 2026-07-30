/**
 * HTML → Markdown conversion tuned for LLM consumption: no HTML residue, no
 * duplicated whitespace, tables kept as GFM, links optionally flattened to text.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export interface MarkdownOptions {
  includeLinks: boolean;
  includeImages: boolean;
}

export function createTurndown(options: MarkdownOptions): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: '  ',
  });

  service.use(gfm);
  service.remove(['script', 'style', 'noscript', 'template']);

  // The GFM plugin bails on tables with colspan/rowspan or no heading row and
  // leaves them as raw HTML, which is the worst possible output for an LLM.
  // This rule takes precedence and always produces pipe rows.
  service.addRule('anyTableAsPipes', {
    filter: 'table',
    replacement: (_content, node) => tableToPipes(node as unknown as MinimalElement, options),
  });

  // Keep fenced code blocks language-annotated when the class name says so.
  service.addRule('fencedCodeWithLanguage', {
    filter: (node) =>
      node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE',
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector('code');
      const className = code?.getAttribute('class') ?? '';
      const language = /(?:language|lang)-(\w+)/.exec(className)?.[1] ?? '';
      const text = (code?.textContent ?? '').replace(/\n$/, '');
      return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
    },
  });

  // Anchors whose only child was a stripped image would render as "[](url)".
  service.addRule('dropEmptyLinks', {
    filter: (node) => node.nodeName === 'A' && (node.textContent ?? '').trim() === '',
    replacement: () => '',
  });

  if (!options.includeLinks) {
    service.addRule('linkAsText', {
      filter: 'a',
      replacement: (content) => content,
    });
  }

  if (!options.includeImages) {
    service.addRule('dropImages', {
      filter: 'img',
      replacement: () => '',
    });
  } else {
    // Images without alt text become noise; give them a stable placeholder.
    service.addRule('imageWithAlt', {
      filter: 'img',
      replacement: (_content, node) => {
        const element = node as HTMLElement;
        const src = element.getAttribute('src');
        if (!src) return '';
        const alt = element.getAttribute('alt')?.trim() ?? '';
        return `![${alt === '' ? 'image' : alt}](${src})`;
      },
    });
  }

  return service;
}

/** The subset of the DOM API turndown hands us that the table rule relies on. */
interface MinimalElement {
  nodeName: string;
  children: ArrayLike<MinimalElement>;
  innerHTML?: string;
  textContent?: string | null;
}

/** Renders any `<table>` as a GFM pipe table, using the first row as the header. */
function tableToPipes(table: MinimalElement, options: MarkdownOptions): string {
  const rows = collectRows(table).map((row) => collectCells(row, options));
  const populated = rows.filter((cells) => cells.length > 0);
  if (populated.length === 0) return '';

  const width = Math.max(...populated.map((cells) => cells.length));
  const pad = (cells: string[]): string[] =>
    Array.from({ length: width }, (_unused, index) => cells[index] ?? '');

  const [header, ...body] = populated;
  const lines = [
    `| ${pad(header ?? []).join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((cells) => `| ${pad(cells).join(' | ')} |`),
  ];

  return `\n\n${lines.join('\n')}\n\n`;
}

/** Rows belonging to this table only; nested tables are skipped. */
function collectRows(table: MinimalElement): MinimalElement[] {
  const rows: MinimalElement[] = [];
  const visit = (element: MinimalElement): void => {
    for (const child of Array.from(element.children ?? [])) {
      if (child.nodeName === 'TABLE') continue;
      if (child.nodeName === 'TR') rows.push(child);
      else visit(child);
    }
  };
  visit(table);
  return rows;
}

function collectCells(row: MinimalElement, options: MarkdownOptions): string[] {
  const cells: string[] = [];
  for (const child of Array.from(row.children ?? [])) {
    if (child.nodeName !== 'TD' && child.nodeName !== 'TH') continue;
    cells.push(cellToMarkdown(child, options));
  }
  return cells;
}

function cellToMarkdown(cell: MinimalElement, options: MarkdownOptions): string {
  const html = cell.innerHTML ?? '';
  const inline = html === '' ? (cell.textContent ?? '') : inlineService(options).turndown(html);
  return inline
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lazily created, cached converter used for the contents of table cells. */
const inlineServices = new Map<string, TurndownService>();
function inlineService(options: MarkdownOptions): TurndownService {
  const key = `${String(options.includeLinks)}:${String(options.includeImages)}`;
  let service = inlineServices.get(key);
  if (!service) {
    service = createTurndown(options);
    inlineServices.set(key, service);
  }
  return service;
}

/** Converts an HTML fragment to normalised Markdown. */
export function htmlToMarkdown(html: string, options: MarkdownOptions): string {
  const service = createTurndown(options);
  return normaliseMarkdown(service.turndown(html));
}

/** Collapses runaway whitespace and strips zero-width characters. */
export function normaliseMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      // Turndown pads list markers to a fixed width; a single space reads better.
      .replace(/^(\s*)([-*+])[ \t]{2,}/gm, '$1$2 ')
      .replace(/^(\s*)(\d+\.)[ \t]{2,}/gm, '$1$2 ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export interface SliceResult {
  text: string;
  totalLength: number;
  startIndex: number;
  endIndex: number;
  truncated: boolean;
  /** `startIndex` to pass on the next call, or null when the document is exhausted. */
  nextStartIndex: number | null;
}

/**
 * Returns a window of the document so large pages can be paged through instead
 * of blowing a model's context window. Cuts on a paragraph or line boundary
 * when one is available near the end of the window.
 */
export function sliceMarkdown(
  markdown: string,
  startIndex: number,
  maxLength: number,
): SliceResult {
  const totalLength = markdown.length;
  const start = Math.min(Math.max(startIndex, 0), totalLength);
  const hardEnd = Math.min(start + maxLength, totalLength);
  let end = hardEnd;

  if (hardEnd < totalLength) {
    const window = markdown.slice(start, hardEnd);
    const paragraphBreak = window.lastIndexOf('\n\n');
    const lineBreak = window.lastIndexOf('\n');
    const cut = paragraphBreak > maxLength * 0.5 ? paragraphBreak : lineBreak;
    if (cut > maxLength * 0.5) end = start + cut;
  }

  const text = markdown.slice(start, end);
  const truncated = end < totalLength;
  return {
    text,
    totalLength,
    startIndex: start,
    endIndex: end,
    truncated,
    nextStartIndex: truncated ? end : null,
  };
}
