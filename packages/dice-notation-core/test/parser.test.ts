import { describe, expect, it } from 'bun:test';
import { aliasPatterns, makeDialect } from './dialect-builder';
import { fromFormula } from '../src';

describe('parser lookahead — peekMatches never advances', () => {
  it('resolves single-letter prefix aliases without side effects', () => {
    const d = makeDialect('lookahead-rerolls', {
      modifierPatterns: aliasPatterns({ r: 'reroll-once', rr: 'reroll-recursive' }),
      rerollBareNumber: true,
    });
    expect(fromFormula(d, '2d6r').modifiers).toEqual([{ op: 'reroll-once' }]);
    expect(fromFormula(d, '2d6rr').modifiers).toEqual([{ op: 'reroll-recursive' }]);
    expect(fromFormula(d, '2d6r1').modifiers).toEqual([
      { op: 'reroll-once', compare: { op: '=', value: 1 } },
    ]);
    expect(fromFormula(d, '2d6rr1').modifiers).toEqual([
      { op: 'reroll-recursive', compare: { op: '=', value: 1 } },
    ]);
    expect(fromFormula(d, '2d6rr<=2').modifiers).toEqual([
      { op: 'reroll-recursive', compare: { op: '<=', value: 2 } },
    ]);
  });

  it('resolves multi-token bang prefixes', () => {
    const d = makeDialect('lookahead-bangs', {
      modifierPatterns: aliasPatterns({
        '!': 'explode',
        '!!': 'explode-compound',
        '!p': 'explode-penetrating',
      }),
    });
    expect(fromFormula(d, '1d6!').modifiers).toEqual([{ op: 'explode' }]);
    expect(fromFormula(d, '1d6!!').modifiers).toEqual([{ op: 'explode-compound' }]);
    expect(fromFormula(d, '1d6!p').modifiers).toEqual([{ op: 'explode-penetrating' }]);
    expect(fromFormula(d, '1d6!>5').modifiers).toEqual([
      { op: 'explode', compare: { op: '>', value: 5 } },
    ]);
  });

  it('falls back to the short pattern when a longer prefix fails', () => {
    const d = makeDialect('lookahead-fallback', {
      modifierPatterns: aliasPatterns({ '!': 'explode', '!p': 'explode-penetrating' }),
      explodeCap: true,
    });
    expect(fromFormula(d, '1d6!2>5').modifiers).toEqual([
      { op: 'explode', cap: 2, compare: { op: '>', value: 5 } },
    ]);
  });
});
