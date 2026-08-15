import { describe, expect, it } from 'bun:test';
import { fromFormula, tokenize } from '../src';
import { canonicalPatterns, makeDialect } from './dialect-builder';

describe('tokenize — superset tokens', () => {
  it('recognizes the pipe token', () => {
    expect(tokenize('|')).toEqual([
      { type: 'pipe', text: '|', start: 0, end: 1 },
      { type: 'eof', text: '', start: 1, end: 1 },
    ]);
  });

  it('tokenizes braced attributes with pipes', () => {
    expect(tokenize('@{a|b}')).toEqual([
      { type: 'at', text: '@', start: 0, end: 1 },
      { type: 'lbrace', text: '{', start: 1, end: 2 },
      { type: 'word', text: 'a', start: 2, end: 3 },
      { type: 'pipe', text: '|', start: 3, end: 4 },
      { type: 'word', text: 'b', start: 4, end: 5 },
      { type: 'rbrace', text: '}', start: 5, end: 6 },
      { type: 'eof', text: '', start: 6, end: 6 },
    ]);
  });
});

describe('tokenize — parser never mutates the token array', () => {
  const dialect = makeDialect('lex-readonly', {
    modifierPatterns: canonicalPatterns('keep-highest'),
    coinFaces: true,
  });

  const snapshotOf = (tokens: ReturnType<typeof tokenize>) => tokens.map((t) => ({ ...t }));

  it('leaves tokens untouched after a successful parse', () => {
    const source = '{2dcoin, 4d6keep-highest3}keep-highest2 + floor((@str - 10) / 2)';
    const tokens = tokenize(source);
    const snapshot = snapshotOf(tokens);
    fromFormula(dialect, source);
    expect(tokens).toEqual(snapshot);
  });

  it('leaves tokens untouched after a partial parse error', () => {
    const source = '4d6keep-highest3 + @';
    const tokens = tokenize(source);
    const snapshot = snapshotOf(tokens);
    expect(() => fromFormula(dialect, source)).toThrow();
    expect(tokens).toEqual(snapshot);
  });

  it('leaves tokens untouched when the die separator splits a word', () => {
    const source = '2dcoin';
    const tokens = tokenize(source);
    const snapshot = snapshotOf(tokens);
    fromFormula(dialect, source);
    expect(tokens).toEqual(snapshot);
  });

  it('leaves tokens untouched when faces parsing fails', () => {
    const source = '2dfoo';
    const tokens = tokenize(source);
    const snapshot = snapshotOf(tokens);
    expect(() => fromFormula(dialect, source)).toThrow();
    expect(tokens).toEqual(snapshot);
  });
});
