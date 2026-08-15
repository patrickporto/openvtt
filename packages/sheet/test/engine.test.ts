import { describe, expect, it } from 'bun:test';
import {
  EffectCycleError,
  PackValidationError,
  SheetEngine,
  createDocument,
  createSheetBus,
  effectInstanceSchema,
  validatePack,
} from '../src';
import type { EffectDefinition, SystemPack } from '../src';
import * as v from 'valibot';
import { makeEngine, makeIds } from './helpers';

const pack: SystemPack = {
  id: 'test-system',
  version: '0.1.0',
  ordinals: {
    dice: ['d4', 'd6', 'd8', 'd10', 'd12'],
  },
  derived: {
    'hp.max': 'hp.base + hp.bonus',
  },
  rollTemplates: {
    attack: {
      expr: {
        '+': [
          { type: 'die', count: 1, faces: { kind: 'number', value: 20 } },
          { var: 'attack_mod' },
        ],
      },
      tags: ['attacks'],
    },
  },
  definitions: [
    {
      id: 'buff.small',
      label: 'Small buff',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '2' }],
    },
    {
      id: 'buff.double',
      label: 'Doubler',
      changes: [{ kind: 'value', path: 'score', op: 'multiply', value: '2' }],
    },
    {
      id: 'buff.override',
      label: 'Override',
      changes: [{ kind: 'value', path: 'score', op: 'set', value: '5' }],
    },
    {
      id: 'item.sharp',
      label: 'Sharp',
      changes: [{ kind: 'value', path: 'die', op: 'upgrade', value: 'dice' }],
    },
    {
      id: 'curse.dull',
      label: 'Dull',
      changes: [{ kind: 'value', path: 'die', op: 'downgrade', value: 'dice', steps: 2 }],
    },
    {
      id: 'state.rage',
      label: 'Rage',
      changes: [{ kind: 'flag', path: 'rage', value: true }],
    },
    {
      id: 'state.furious-strength',
      label: 'Furious strength',
      condition: 'flags.rage',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '5' }],
    },
    {
      id: 'def.shield-wall',
      label: 'Shield wall',
      stacking: { group: 'shield', mode: 'newest' },
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    },
    {
      id: 'def.ward',
      label: 'Ward',
      stacking: { group: 'ward', mode: 'highest-priority' },
      priority: 1,
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    },
    {
      id: 'def.greater-ward',
      label: 'Greater ward',
      stacking: { group: 'ward', mode: 'highest-priority' },
      priority: 5,
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '4' }],
    },
    {
      id: 'spell.bless',
      label: 'Bless',
      duration: { unit: 'rounds', value: 2 },
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    },
    {
      id: 'spell.haste',
      label: 'Haste',
      duration: { unit: 'until-event', event: 'turn:end' },
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '3' }],
    },
    {
      id: 'spell.long',
      label: 'Long buff',
      duration: { unit: 'seconds', value: 60 },
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    },
    {
      id: 'conditions.poisoned',
      label: 'Poisoned',
      triggers: [
        {
          on: 'turn:start',
          changes: [{ kind: 'value', path: 'hp.current', op: 'add', value: '-2' }],
        },
      ],
      changes: [],
    },
    {
      id: 'conditions.blessed',
      label: 'Blessed',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    },
    {
      id: 'feat.rally',
      label: 'Rally',
      triggers: [{ on: 'kill', effect: 'conditions.blessed' }],
      changes: [],
    },
    {
      id: 'spell.magic-surge',
      label: 'Magic surge',
      triggers: [{ on: 'turn:start', roll: '1d6' }],
      changes: [],
    },
    {
      id: 'roll.advantage',
      label: 'Advantage',
      changes: [
        {
          kind: 'roll',
          target: 'attacks',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 1 }] },
        },
      ],
    },
    {
      id: 'roll.bless-dice',
      label: 'Bless dice',
      changes: [
        {
          kind: 'roll',
          target: 'attack',
          transform: { extraDice: [{ count: 1, faces: 4 }] },
        },
      ],
    },
    {
      id: 'param.bonus',
      label: 'Parametrized',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: 'data.bonus' }],
    },
  ],
};

const base = {
  score: 10,
  die: 'd6',
  hp: { base: 20, bonus: 0, current: 18 },
  attack_mod: 5,
};

describe('apply passes', () => {
  it('applies set -> add -> multiply in fixed passes regardless of priority', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.double', { id: 'a-001' });
    engine.applyEffect('buff.small', { id: 'a-002' });
    expect(engine.compute().values.score).toBe(24);
  });

  it('set pass runs before add and multiply', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.override', { id: 'a-001' });
    engine.applyEffect('buff.small', { id: 'a-002' });
    engine.applyEffect('buff.double', { id: 'a-003' });
    expect(engine.compute().values.score).toBe(14);
  });

  it('sorts same-priority effects by id, not creation order', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.small', { id: 'zz-999' });
    engine.applyEffect('buff.override', { id: 'aa-001' });
    const audit = engine.compute().audit;
    const setEntry = audit.find((e) => e.pass === 'set')!;
    expect(setEntry.effectId).toBe('aa-001');
  });

  it('upgrades and downgrades ordinals with clamping', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('item.sharp', { id: 'a-001' });
    expect(engine.compute().values.die).toBe('d8');
    engine.applyEffect('curse.dull', { id: 'a-002' });
    expect(engine.compute().values.die).toBe('d4');
    engine.applyEffect('curse.dull', { id: 'a-003' });
    expect(engine.compute().values.die).toBe('d4');
  });

  it('evaluates change formulas with instance data', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('param.bonus', { id: 'a-001', data: { bonus: 7 } });
    expect(engine.compute().values.score).toBe(17);
  });
});

describe('conditions & fixed point', () => {
  it('gates effects behind flag conditions', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('state.furious-strength', { id: 'a-001' });
    expect(engine.compute().values.score).toBe(10);
    engine.applyEffect('state.rage', { id: 'a-002' });
    expect(engine.compute().values.score).toBe(15);
    engine.removeEffect('a-002');
    expect(engine.compute().values.score).toBe(10);
  });

  it('resolves condition chains through the dependency graph instead of failing', () => {
    const chainPack: SystemPack = {
      id: 'chain',
      version: '1.0.0',
      definitions: [
        {
          id: 'c1',
          label: 'c1',
          condition: 'hp.current > 0',
          changes: [{ kind: 'value', path: 'chain', op: 'set', value: '1' }],
        },
        {
          id: 'c2',
          label: 'c2',
          condition: 'chain == 1',
          changes: [{ kind: 'value', path: 'other', op: 'set', value: '1' }],
        },
      ],
    };
    const alive = makeEngine(chainPack, { hp: { current: 50 } });
    alive.engine.applyEffect('c1', { id: 'c-001' });
    alive.engine.applyEffect('c2', { id: 'c-002' });
    expect(alive.engine.compute().values.chain).toBe(1);
    expect(alive.engine.compute().values.other).toBe(1);

    const dead = makeEngine(chainPack, { hp: { current: 0 } });
    dead.engine.applyEffect('c1', { id: 'c-001' });
    dead.engine.applyEffect('c2', { id: 'c-002' });
    const computed = dead.engine.compute();
    expect(computed.values.chain).toBeUndefined();
    expect(computed.values.other).toBeUndefined();
    expect(computed.suppressed.map((s) => s.reason)).toEqual(['condition', 'condition']);
  });

  it('rejects packs with condition dependency cycles at validation time', () => {
    const cyclePack: SystemPack = {
      id: 'cycle',
      version: '1.0.0',
      definitions: [
        {
          id: 'a',
          label: 'a',
          condition: 'flags.b',
          changes: [{ kind: 'flag', path: 'a', value: true }],
        },
        {
          id: 'b',
          label: 'b',
          condition: 'flags.a',
          changes: [{ kind: 'flag', path: 'b', value: true }],
        },
      ],
    };
    expect(() => validatePack(cyclePack)).toThrow(PackValidationError);
  });

  it('throws an explicit cycle error on runtime (inline) condition cycles', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect(
      {
        id: 'inline.a',
        label: 'a',
        condition: 'flags.b',
        changes: [{ kind: 'flag', path: 'a', value: true }],
      },
      { id: 'c-001' },
    );
    expect(() =>
      engine.applyEffect(
        {
          id: 'inline.b',
          label: 'b',
          condition: 'flags.a',
          changes: [{ kind: 'flag', path: 'b', value: true }],
        },
        { id: 'c-002' },
      ),
    ).toThrow(EffectCycleError);
    try {
      engine.compute();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EffectCycleError);
      expect((err as EffectCycleError).effectIds).toContain('c-001');
      expect((err as EffectCycleError).effectIds).toContain('c-002');
    }
  });
});

describe('stacking', () => {
  it('keeps only the newest instance in newest mode', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('def.shield-wall', { id: 'a-001' });
    engine.applyEffect('def.shield-wall', { id: 'a-002' });
    const computed = engine.compute();
    expect(computed.effects.map((e) => e.id)).toEqual(['a-002']);
    expect(computed.values.score).toBe(11);
    expect(computed.suppressed).toEqual([
      { instance: expect.objectContaining({ id: 'a-001' }), reason: 'stacking' },
    ]);
  });

  it('keeps the highest priority instance in highest-priority mode', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('def.greater-ward', { id: 'a-001' });
    engine.applyEffect('def.ward', { id: 'a-002' });
    const computed = engine.compute();
    expect(computed.effects.map((e) => e.id)).toEqual(['a-001']);
    expect(computed.values.score).toBe(14);
  });
});

describe('removal & cascade', () => {
  it('removes effects by source, cascading children', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.small', { id: 'a-001', source: { kind: 'spell', id: 's1' } });
    engine.applyEffect('buff.double', { id: 'a-002', source: { kind: 'spell', id: 's1' } });
    engine.applyEffect('buff.override', { id: 'a-003', source: { kind: 'equipment' } });
    const removed = engine.removeBySource({ kind: 'spell', id: 's1' });
    expect(removed.map((e) => e.id)).toEqual(['a-001', 'a-002']);
    expect(engine.document.effects.map((e) => e.id)).toEqual(['a-003']);
  });

  it('toggles enabled state', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.small', { id: 'a-001' });
    expect(engine.compute().values.score).toBe(12);
    engine.setEnabled('a-001', false);
    expect(engine.compute().values.score).toBe(10);
  });
});

describe('durations & expiration', () => {
  it('expires round-based effects on round:end ticks', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('spell.bless', { id: 'a-001' });
    expect(engine.compute().values.score).toBe(11);
    engine.notifyEvent('round:end');
    expect(engine.compute().values.score).toBe(11);
    engine.notifyEvent('round:end');
    expect(engine.compute().values.score).toBe(10);
    expect(engine.document.effects).toHaveLength(0);
  });

  it('expires until-event effects when the event fires', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('spell.haste', { id: 'a-001' });
    engine.notifyEvent('turn:start');
    expect(engine.compute().values.score).toBe(13);
    engine.notifyEvent('turn:end');
    expect(engine.compute().values.score).toBe(10);
  });

  it('expires second-based effects via tickSeconds', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('spell.long', { id: 'a-001' });
    engine.tickSeconds(30);
    expect(engine.document.effects).toHaveLength(1);
    engine.tickSeconds(31);
    expect(engine.document.effects).toHaveLength(0);
  });
});

describe('triggers', () => {
  it('applies recurring declarative changes (poison damage)', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('conditions.poisoned', { id: 'a-001' });
    engine.notifyEvent('turn:start');
    expect((engine.document.base.hp as Record<string, unknown>).current).toBe(16);
    engine.notifyEvent('turn:start');
    expect((engine.document.base.hp as Record<string, unknown>).current).toBe(14);
  });

  it('spawns another effect instance from a trigger', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('feat.rally', { id: 'a-001' });
    engine.notifyEvent('kill');
    const spawned = engine.document.effects.find((e) => e.ref === 'conditions.blessed');
    expect(spawned).toBeDefined();
    expect(spawned!.source).toEqual({ kind: 'trigger', id: 'a-001' });
    expect(engine.compute().values.score).toBe(11);
  });

  it('rolls declarative trigger dice and emits trigger:roll', () => {
    const bus = createSheetBus();
    const seen: number[] = [];
    bus.on('trigger:roll', (payload) => seen.push(payload.value));
    const { engine } = makeEngine(pack, structuredClone(base), {
      bus,
      roller: () => 42,
    });
    engine.applyEffect('spell.magic-surge', { id: 'a-001' });
    engine.notifyEvent('turn:start');
    expect(seen).toEqual([42]);
  });
});

describe('derived graph & audit', () => {
  it('derives computed values and audits every touch', () => {
    const derivedPack: SystemPack = {
      id: 'derived',
      version: '1.0.0',
      derived: {
        'hp.max': 'hp.base + hp.bonus',
        'hp.percent': 'hp.current / hp.max',
      },
      definitions: [
        {
          id: 'tough',
          label: 'Tough',
          changes: [{ kind: 'value', path: 'hp.bonus', op: 'add', value: '10' }],
        },
      ],
    };
    const { engine } = makeEngine(derivedPack, { hp: { base: 20, bonus: 0, current: 15 } });
    engine.applyEffect('tough', { id: 'a-001' });
    const computed = engine.compute();
    expect((computed.values.hp as Record<string, unknown>).max).toBe(30);
    expect((computed.values.hp as Record<string, unknown>).percent).toBe(0.5);

    const why = computed.audit.filter((e) => e.path === 'hp.bonus' || e.path === 'hp.max');
    expect(why.map((e) => e.pass)).toEqual(['add', 'derived']);
    expect(why[0]).toMatchObject({ effectId: 'a-001', op: 'add', input: 10, result: 10 });
  });

  it('rejects packs with derived cycles at validation time', () => {
    const cyclic: SystemPack = {
      id: 'bad',
      version: '1.0.0',
      derived: {
        a: 'b + 1',
        b: 'a + 1',
      },
    };
    expect(() => validatePack(cyclic)).toThrow(PackValidationError);
  });

  it('rejects packs with invalid formulas', () => {
    const bad: SystemPack = {
      id: 'bad',
      version: '1.0.0',
      derived: { x: 'foo(' },
    };
    expect(() => validatePack(bad)).toThrow(PackValidationError);
  });
});

describe('roll transforms (IR, no string replace)', () => {
  it('applies advantage as IR transform on tagged templates', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('roll.advantage', { id: 'a-001' });
    const roll = engine.buildRoll('attack') as Record<string, any>;
    const die = roll['+'][0];
    expect(die.count).toBe(2);
    expect(die.modifiers).toEqual([{ op: 'keep-highest', count: 1 }]);
  });

  it('appends extra dice as IR terms, matching template id or tags', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('roll.bless-dice', { id: 'a-001' });
    const roll = engine.buildRoll('attack') as Record<string, any>;
    const extra = roll['+'][1]['+']?.[1] ?? roll['+'][1];
    expect(roll['+'][1]).toMatchObject({ type: 'die', count: 1, faces: { value: 4 } });
    expect(extra).toBeDefined();
  });

  it('leaves the IR untouched when no roll effects are active', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    const roll = engine.buildRoll('attack') as Record<string, any>;
    expect(roll['+'][0]).toMatchObject({ count: 1, faces: { value: 20 } });
  });
});

describe('events & patches', () => {
  it('emits effect:applied and computed patches on the bus', () => {
    const bus = createSheetBus();
    const applied: string[] = [];
    const patchPaths: string[][] = [];
    bus.on('effect:applied', (p) => applied.push(p.instanceId));
    bus.on('computed', (p) => patchPaths.push(p.patches.map((x) => x.path)));
    const { engine } = makeEngine(pack, structuredClone(base), { bus });
    engine.applyEffect('buff.small', { id: 'a-001' });
    expect(applied).toEqual(['a-001']);
    expect(patchPaths.at(-1)).toEqual(['score']);
  });

  it('emits effect:expired when a duration ends through the bus (attach)', () => {
    const bus = createSheetBus();
    const expired: string[] = [];
    bus.on('effect:expired', (p) => expired.push(p.instanceId));
    const { engine } = makeEngine(pack, structuredClone(base), { bus });
    engine.attach();
    engine.applyEffect('spell.haste', { id: 'a-001' });
    bus.emit('turn:end', {});
    expect(expired).toEqual(['a-001']);
    expect(engine.compute().values.score).toBe(10);
  });

  it('does not react to bus events before attach', () => {
    const bus = createSheetBus();
    const { engine } = makeEngine(pack, structuredClone(base), { bus });
    engine.applyEffect('spell.haste', { id: 'a-001' });
    bus.emit('turn:end', {});
    expect(engine.document.effects).toHaveLength(1);
    expect(engine.compute().values.score).toBe(13);
  });

  it('queues reentrant events instead of dropping them', () => {
    const reentrantPack: SystemPack = {
      id: 'reentrant',
      version: '1.0.0',
      definitions: [
        {
          id: 'listener',
          label: 'Listener',
          changes: [],
          triggers: [
            { on: 'ping', effect: 'spawned' },
            {
              on: 'effect:applied',
              changes: [{ kind: 'value', path: 'marker', op: 'set', value: '1' }],
            },
          ],
        },
        { id: 'spawned', label: 'Spawned', changes: [] },
      ],
    };
    const bus = createSheetBus();
    const { engine } = makeEngine(reentrantPack, { marker: 0 }, { bus });
    engine.applyEffect('listener', { id: 'a-001' });
    engine.attach();
    engine.notifyEvent('ping');
    expect(engine.document.base.marker).toBe(1);
  });
});

describe('document & interop', () => {
  it('exposes the document as a snapshot: external mutation does not corrupt the engine', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    engine.applyEffect('buff.small', { id: 'a-001' });
    const leaked = engine.document;
    leaked.effects.length = 0;
    leaked.base.score = 999;
    expect(engine.document.effects).toHaveLength(1);
    expect(engine.compute().values.score).toBe(12);
  });

  it('clones the constructor document: mutating the original never reaches the engine', () => {
    const document = createDocument(pack, { base: structuredClone(base) });
    const engine = new SheetEngine(document, { pack, id: makeIds() });
    document.base.score = 999;
    document.effects.push({
      id: 'a-999',
      ref: 'buff.small',
      source: { kind: 'manual' },
      enabled: true,
    });
    expect(engine.document.base.score).toBe(10);
    expect(engine.document.effects).toHaveLength(0);
    expect(engine.compute().values.score).toBe(10);

    engine.updateBase((b) => ({ ...b, score: 20 }));
    expect(engine.compute().values.score).toBe(20);
    expect(document.base.score).toBe(999);
  });

  it('validates uuid v7 instance ids through the schema', () => {
    const document = createDocument(pack, { base: structuredClone(base) });
    const engine = new SheetEngine(document, { pack });
    const instance = engine.applyEffect('buff.small');
    const parsed = v.safeParse(effectInstanceSchema, instance);
    expect(parsed.success).toBe(true);
  });

  it('recomputes deterministically: two engines, same document, same result', () => {
    const doc = createDocument(pack, { base: structuredClone(base) });
    const a = new SheetEngine(structuredClone(doc), { pack, id: makeIds() });
    const b = new SheetEngine(structuredClone(doc), { pack, id: makeIds() });
    for (const engine of [a, b]) {
      engine.applyEffect('buff.small');
      engine.applyEffect('state.rage');
      engine.applyEffect('state.furious-strength');
    }
    expect(a.compute().values).toEqual(b.compute().values);
    expect(a.compute().audit).toEqual(b.compute().audit);
  });

  it('supports ad-hoc inline definitions', () => {
    const { engine } = makeEngine(pack, structuredClone(base));
    const inline: EffectDefinition = {
      id: 'ad-hoc.gm-fiat',
      label: 'GM fiat',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '100' }],
    };
    engine.applyEffect(inline, { id: 'a-001' });
    expect(engine.compute().values.score).toBe(110);
  });
});
