import sanitizeHtml from 'sanitize-html';

/**
 * Converts publisher-provided HTML/text into safe plain text. We never store or render publisher
 * HTML: tags are dropped (scripts/styles with their content), entities decoded, and whitespace
 * collapsed. React escapes the result again at render time.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  const withBreaks = input.replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, ' ');
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'svg',
      'math',
      'template',
    ],
  });
  return decodeEntities(stripped)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  middot: '·',
  bull: '•',
  deg: '°',
};

export function decodeEntities(s: string): string {
  // Two passes handle double-encoded feeds ("&amp;amp;") without looping forever.
  let out = s;
  for (let i = 0; i < 2; i++) {
    const next = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,30});/gi, (m, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (
          !Number.isFinite(code) ||
          code <= 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        )
          return '';
        return String.fromCodePoint(code);
      }
      return NAMED[body.toLowerCase()] ?? m;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Truncates on a word boundary (grapheme-safe for surrogate pairs) and appends an ellipsis. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let cut = chars.slice(0, max - 1).join('');
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[\s,.;:–—-]+$/u, '')}…`;
}
