import { describe, expect, it } from 'bun:test';
import { fromFormula, toFormula } from '../src';
import { canonicalPatterns, makeDialect } from './dialect-builder';

describe('round-trip with a canonical identity-sigil dialect', () => {
  const dialect = makeDialect('roundtrip', {
    modifierPatterns: canonicalPatterns(
      'keep-highest',
      'reroll-once',
      'explode',
      'count-success',
      'min',
    ),
  });

  const cases = [
    '2d6',
    '4dF',
    '4d6keep-highest3',
    '3d6min2',
    '2d6reroll-once<=2',
    '1d6explode>5',
    '4d10count-success>=8',
    '{2d6, 1d8}keep-highest2',
    '1d20 + floor((@str - 10) / 2)',
  ];

  for (const source of cases) {
    it(`round-trips "${source}"`, () => {
      const ir = fromFormula(dialect, source);
      const printed = toFormula(dialect, ir);
      expect(printed).toBe(source);
      expect(fromFormula(dialect, printed)).toEqual(ir);
    });
  }
});
