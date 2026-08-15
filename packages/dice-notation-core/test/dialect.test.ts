import { describe, expect, it } from 'bun:test';
import {
  buildModifierPatterns,
  fromFormula,
  NotationErrorBase,
  toFormula,
} from '../src';
import {
  aliasPatterns,
  canonicalPatterns,
  makeDialect,
  mergePatterns,
  TestNotationError,
} from './dialect-builder';

describe('DialectConfig.implicitCountSuccess', () => {
  const on = makeDialect('implicit-count-success-on', { implicitCountSuccess: true });
  const off = makeDialect('implicit-count-success-off');

  it('turns a bare comparison into count-success when enabled', () => {
    expect(fromFormula(on, '5d10>6')).toEqual({
      type: 'die',
      count: 5,
      faces: { kind: 'number', value: 10 },
      modifiers: [{ op: 'count-success', compare: { op: '>', value: 6 } }],
    });
    expect(fromFormula(on, '5d10<=4').modifiers).toEqual([
      { op: 'count-success', compare: { op: '<=', value: 4 } },
    ]);
  });

  it('rejects a bare comparison when disabled', () => {
    expect(() => fromFormula(off, '5d10>6')).toThrow(TestNotationError);
  });
});

describe('DialectConfig.rerollBareNumber', () => {
  const patterns = aliasPatterns({ r: 'reroll-once' });
  const on = makeDialect('reroll-bare-number-on', {
    modifierPatterns: patterns,
    rerollBareNumber: true,
  });
  const off = makeDialect('reroll-bare-number-off', { modifierPatterns: patterns });

  it('parses a bare number as an "=" comparison when enabled', () => {
    expect(fromFormula(on, '2d6r1').modifiers).toEqual([
      { op: 'reroll-once', compare: { op: '=', value: 1 } },
    ]);
  });

  it('leaves a bare number unconsumed when disabled', () => {
    expect(() => fromFormula(off, '2d6r1')).toThrow(/Unexpected "1"/);
  });
});

describe('DialectConfig.rerollOmitEquals', () => {
  const base = {
    modifierPatterns: aliasPatterns({ r: 'reroll-once' }),
    sigils: { 'reroll-once': 'r' },
    rerollBareNumber: true,
  };
  const on = makeDialect('reroll-omit-equals-on', { ...base, rerollOmitEquals: true });
  const off = makeDialect('reroll-omit-equals-off', base);

  it('omits "=" when serializing an equals comparison', () => {
    expect(toFormula(on, fromFormula(on, '2d6r=1'))).toBe('2d6r1');
  });

  it('keeps "=" when disabled', () => {
    expect(toFormula(off, fromFormula(off, '2d6r=1'))).toBe('2d6r=1');
  });

  it('never omits other comparison operators', () => {
    expect(toFormula(on, fromFormula(on, '2d6r<=2'))).toBe('2d6r<=2');
  });
});

describe('DialectConfig.explodeCap', () => {
  const patterns = aliasPatterns({ '!': 'explode' });
  const sigils = { explode: '!' };
  const on = makeDialect('explode-cap-on', {
    modifierPatterns: patterns,
    sigils,
    explodeCap: true,
  });
  const off = makeDialect('explode-cap-off', { modifierPatterns: patterns, sigils });

  it('parses a cap number before the comparison when enabled', () => {
    const ir = fromFormula(on, '1d6!3>5');
    expect(ir).toEqual({
      type: 'die',
      count: 1,
      faces: { kind: 'number', value: 6 },
      modifiers: [{ op: 'explode', cap: 3, compare: { op: '>', value: 5 } }],
    });
    expect(toFormula(on, ir)).toBe('1d6!3>5');
  });

  it('rejects cap syntax when disabled', () => {
    expect(() => fromFormula(off, '1d6!3>5')).toThrow(/Unexpected "3"/);
  });

  it('drops the cap when serializing with the flag disabled', () => {
    expect(toFormula(off, fromFormula(on, '1d6!3>5'))).toBe('1d6!>5');
  });
});

describe('DialectConfig.noArgOps', () => {
  it('accepts the op without its argument when listed', () => {
    const d = makeDialect('no-arg-ops-on', {
      modifierPatterns: canonicalPatterns('min'),
      noArgOps: ['min'],
    });
    expect(fromFormula(d, '3d6min').modifiers).toEqual([{ op: 'min' }]);
  });

  it('requires the argument when not listed', () => {
    const d = makeDialect('no-arg-ops-off', { modifierPatterns: canonicalPatterns('min') });
    expect(() => fromFormula(d, '3d6min')).toThrow(/clamp value/);
  });

  it('takes precedence over ops that would consume a count', () => {
    const d = makeDialect('no-arg-ops-precedence', {
      modifierPatterns: canonicalPatterns('keep-highest'),
      noArgOps: ['keep-highest'],
    });
    expect(fromFormula(d, '4d6keep-highest').modifiers).toEqual([{ op: 'keep-highest' }]);
    expect(() => fromFormula(d, '4d6keep-highest3')).toThrow(/Unexpected "3"/);
  });
});

describe('DialectConfig.coinFaces', () => {
  const on = makeDialect('coin-faces-on', { coinFaces: true, facesHint: '6, coin' });
  const off = makeDialect('coin-faces-off', { facesHint: '6, F' });

  it('parses coin faces when enabled', () => {
    expect(fromFormula(on, '2dcoin')).toEqual({
      type: 'die',
      count: 2,
      faces: { kind: 'coin' },
    });
    expect(fromFormula(on, '2dc').faces).toEqual({ kind: 'coin' });
  });

  it('serializes coin faces with coinFace', () => {
    expect(toFormula(on, fromFormula(on, '2dcoin'))).toBe('2dcoin');
    const short = makeDialect('coin-faces-short', { coinFaces: true, coinFace: 'c' });
    expect(toFormula(short, fromFormula(on, '2dcoin'))).toBe('2dc');
  });

  it('rejects coin faces when disabled', () => {
    expect(() => fromFormula(off, '2dcoin')).toThrow(/Expected die faces \(e\.g\. 6, F\)/);
    expect(() => fromFormula(off, '2dc')).toThrow(/Expected die faces \(e\.g\. 6, F\)/);
  });
});

describe('DialectConfig.bracedAttributes', () => {
  const braced = makeDialect('braced-attributes-on', { bracedAttributes: true });
  const dotted = makeDialect('braced-attributes-off');

  it('parses @{a|b} into a dotted path when enabled', () => {
    expect(fromFormula(braced, '@{str|mod}')).toEqual({ var: 'str.mod' });
    expect(fromFormula(braced, '@{a|b|c}')).toEqual({ var: 'a.b.c' });
    expect(fromFormula(braced, '@{str.mod}')).toEqual({ var: 'str.mod' });
  });

  it('serializes var refs with braces when enabled', () => {
    expect(toFormula(braced, { var: 'str.mod' })).toBe('@{str.mod}');
  });

  it('parses dotted @a.b when disabled', () => {
    expect(fromFormula(dotted, '@str.mod')).toEqual({ var: 'str.mod' });
    expect(toFormula(dotted, { var: 'str.mod' })).toBe('@str.mod');
  });

  it('rejects the other syntax on each side', () => {
    expect(() => fromFormula(braced, '@str.mod')).toThrow(/Expected "\{"/);
    expect(() => fromFormula(dotted, '@{str|mod}')).toThrow(/a path name/);
  });
});

describe('DialectConfig.ambiguousAliases', () => {
  const patterns = mergePatterns(
    canonicalPatterns('reroll-once'),
    aliasPatterns({ r: 'reroll-once' }),
  );

  it('rejects a listed alias with the dialect error', () => {
    const d = makeDialect('ambiguous-aliases-on', {
      modifierPatterns: patterns,
      ambiguousAliases: ['r'],
    });
    expect(() => fromFormula(d, '2d6r')).toThrow(TestNotationError);
    expect(() => fromFormula(d, '2d6r')).toThrow(/Ambiguous alias "r" is rejected/);
  });

  it('still parses the canonical name while the alias is rejected', () => {
    const d = makeDialect('ambiguous-aliases-canonical', {
      modifierPatterns: patterns,
      ambiguousAliases: ['r'],
    });
    expect(fromFormula(d, '2d6reroll-once').modifiers).toEqual([{ op: 'reroll-once' }]);
  });

  it('accepts the alias when not listed', () => {
    const d = makeDialect('ambiguous-aliases-off', { modifierPatterns: patterns });
    expect(fromFormula(d, '2d6r').modifiers).toEqual([{ op: 'reroll-once' }]);
  });
});

describe('DialectConfig.countSuccessBare', () => {
  const patterns = mergePatterns(
    canonicalPatterns('count-success'),
    aliasPatterns({ cs: 'count-success' }),
  );
  const on = makeDialect('count-success-bare-on', {
    modifierPatterns: patterns,
    sigils: { 'count-success': 'cs' },
    implicitCountSuccess: true,
    countSuccessBare: true,
  });
  const off = makeDialect('count-success-bare-off', {
    modifierPatterns: patterns,
    sigils: { 'count-success': 'cs' },
  });

  it('serializes count-success as a bare comparison when enabled', () => {
    const ir = fromFormula(on, '4d10cs>=8');
    expect(toFormula(on, ir)).toBe('4d10>=8');
    expect(fromFormula(on, toFormula(on, ir))).toEqual(ir);
  });

  it('falls back to the sigil without a comparison', () => {
    expect(toFormula(on, fromFormula(on, '4d10cs'))).toBe('4d10cs');
  });

  it('keeps the sigil prefix when disabled', () => {
    expect(toFormula(off, fromFormula(off, '4d10cs>=8'))).toBe('4d10cs>=8');
  });
});

describe('DialectConfig.sigils', () => {
  it('defaults serialization to canonical names', () => {
    const d = makeDialect('sigils-identity', {
      modifierPatterns: canonicalPatterns('keep-highest'),
    });
    expect(toFormula(d, fromFormula(d, '4d6keep-highest3'))).toBe('4d6keep-highest3');
  });

  it('serializes with sigils when mapped', () => {
    const canonical = makeDialect('sigils-canonical', {
      modifierPatterns: canonicalPatterns('keep-highest'),
    });
    const d = makeDialect('sigils-mapped', {
      modifierPatterns: mergePatterns(
        canonicalPatterns('keep-highest'),
        aliasPatterns({ kh: 'keep-highest' }),
      ),
      sigils: { 'keep-highest': 'kh' },
    });
    expect(toFormula(d, fromFormula(canonical, '4d6keep-highest3'))).toBe('4d6kh3');
    expect(toFormula(d, fromFormula(d, '4d6kh3'))).toBe('4d6kh3');
    expect(toFormula(d, fromFormula(d, '4d6keep-highest3'))).toBe('4d6kh3');
  });

  it('falls back to the canonical name for unmapped ops', () => {
    const d = makeDialect('sigils-partial', {
      modifierPatterns: canonicalPatterns('keep-highest', 'sort-asc'),
      sigils: { 'keep-highest': 'kh' },
    });
    expect(toFormula(d, fromFormula(d, '3d6sort-asc'))).toBe('3d6sort-asc');
  });
});

describe('DialectConfig.facesHint', () => {
  it('surfaces the hint in the faces error', () => {
    const d = makeDialect('faces-hint', { facesHint: '6, %, F' });
    expect(() => fromFormula(d, '2dfoo')).toThrow(/Expected die faces \(e\.g\. 6, %, F\)/);
    expect(() => fromFormula(d, '2d')).toThrow(/Expected die faces \(e\.g\. 6, %, F\)/);
  });

  it('carries the position of the offending token', () => {
    const d = makeDialect('faces-hint-position', { facesHint: '6' });
    try {
      fromFormula(d, '2dfoo');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as TestNotationError;
      expect(e).toBeInstanceOf(TestNotationError);
      expect(e.position).toBe(2);
      expect(e.input).toBe('2dfoo');
    }
  });
});

describe('NotationErrorBase via createError factory', () => {
  const d = makeDialect('errors');

  it('produces factory errors carrying position and input', () => {
    try {
      fromFormula(d, '2d6 + %');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as TestNotationError;
      expect(e).toBeInstanceOf(TestNotationError);
      expect(e).toBeInstanceOf(NotationErrorBase);
      expect(e.name).toBe('TestNotationError');
      expect(e.message).toBe('[test] Unexpected "%"');
      expect(e.position).toBe(6);
      expect(e.input).toBe('2d6 + %');
    }
  });

  it('counts positions across newlines', () => {
    try {
      fromFormula(d, '2d6\n+%');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as TestNotationError;
      expect(e.position).toBe(5);
      expect(e.input).toBe('2d6\n+%');
    }
  });

  it('preserves the factory error prototype through throws', () => {
    expect(() => fromFormula(d, '2d6 + @')).toThrow(TestNotationError);
  });
});
