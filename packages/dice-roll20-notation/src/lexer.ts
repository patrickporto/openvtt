export type TokenType =
  | 'num'
  | 'word'
  | 'plus'
  | 'dash'
  | 'star'
  | 'slash'
  | 'percent'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'comma'
  | 'colon'
  | 'question'
  | 'bang'
  | 'at'
  | 'dot'
  | 'pipe'
  | 'eq'
  | 'gt'
  | 'ge'
  | 'lt'
  | 'le'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  readonly value?: number;
  readonly start: number;
  readonly end: number;
}

const TWO_CHAR: Record<string, TokenType> = {
  '>=': 'ge',
  '<=': 'le',
};

const SINGLE: Record<string, TokenType> = {
  '+': 'plus',
  '-': 'dash',
  '*': 'star',
  '/': 'slash',
  '%': 'percent',
  '(': 'lparen',
  ')': 'rparen',
  '{': 'lbrace',
  '}': 'rbrace',
  ',': 'comma',
  ':': 'colon',
  '?': 'question',
  '!': 'bang',
  '@': 'at',
  '.': 'dot',
  '|': 'pipe',
  '=': 'eq',
  '>': 'gt',
  '<': 'lt',
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z_]/;
const DIGIT = /[0-9]/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '#') {
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    const start = i;

    if (DIGIT.test(ch)) {
      let num = '';
      while (i < len && DIGIT.test(source[i]!)) num += source[i++];
      if (source[i] === '.' && DIGIT.test(source[i + 1] ?? '')) {
        num += source[i++];
        while (i < len && DIGIT.test(source[i]!)) num += source[i++];
      }
      tokens.push({ type: 'num', text: num, value: Number(num), start, end: i });
      continue;
    }

    if (IDENT_START.test(ch)) {
      let word = '';
      while (i < len && IDENT_PART.test(source[i]!)) word += source[i++];
      tokens.push({ type: 'word', text: word, start, end: i });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR[two]) {
      tokens.push({ type: TWO_CHAR[two]!, text: two, start, end: i + 2 });
      i += 2;
      continue;
    }

    const single = SINGLE[ch];
    if (single) {
      tokens.push({ type: single, text: ch, start, end: i + 1 });
      i++;
      continue;
    }

    throw new SyntaxError(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: 'eof', text: '', start: len, end: len });
  return tokens;
}
