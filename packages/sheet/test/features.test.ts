import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import {
  PackValidationError,
  SheetEngine,
  SheetError,
  createDocument,
  createSheetBus,
  defineSystemPack,
  validatePack,
} from '../src';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

describe('collection ops (append/remove)', () => {
  const pack: SystemPack = {
    id: 'collections',
    version: '1.0.0',
    definitions: [
      {
        id: 'training.martial-weapons',
        label: 'Martial weapons',
        changes: [
          { kind: 'value', path: 'proficiencies', op: 'append', value: 'martial-weapons' },
        ],
      },
      {
        id: 'training.blacksmith',
        label: 'Blacksmith tools',
        changes: [
          { kind: 'value', path: 'proficiencies', op: 'append', value: 'smith-tools' },
        ],
      },
      {
        id: 'curse.forget-craft',
        label: 'Forget craft',
        changes: [
          { kind: 'value', path: 'proficiencies', op: 'remove', value: 'smith-tools' },
        ],
      },
      {
        id: 'resistance.fire',
        label: 'Fire resistance',
        changes: [{ kind: 'value', path: 'resistances', op: 'append', value: 'fire' }],
      },
    ],
  };

  it('appends unique string literals to arrays', () => {
    const { engine } = makeEngine(pack, {});
    engine.applyEffect('training.martial-weapons', { id: 'a-001' });
    engine.applyEffect('training.blacksmith', { id: 'a-002' });
    engine.applyEffect('training.martial-weapons', { id: 'a-003' });
    expect(engine.compute().values.proficiencies).toEqual(['martial-weapons', 'smith-tools']);
  });

  it('removes entries and cascades on removal', () => {
    const { engine } = makeEngine(pack, {});
    const blacksmith = engine.applyEffect('training.blacksmith', { id: 'a-001' });
    engine.applyEffect('curse.forget-craft', { id: 'a-002' });
    expect(engine.compute().values.proficiencies).toEqual([]);
    engine.removeEffect(blacksmith.id);
    expect(engine.compute().values.proficiencies).toEqual([]);
  });

  it('keeps audit entries for collection ops', () => {
    const { engine } = makeEngine(pack, {});
    engine.applyEffect('resistance.fire', { id: 'a-001' });
    const entry = engine.compute().audit.find((e) => e.path === 'resistances')!;
    expect(entry).toMatchObject({ op: 'append', input: 'fire', result: ['fire'] });
  });
});

describe('grants (effects granting effects)', () => {
  const pack: SystemPack = {
    id: 'grants',
    version: '1.0.0',
    definitions: [
      {
        id: 'class.fighter.level-2',
        label: 'Fighter 2',
        changes: [{ kind: 'value', path: 'level', op: 'set', value: '2' }],
        grants: ['feature.action-surge', { ref: 'feature.second-wind', data: { die: 10 } }],
      },
      {
        id: 'feature.action-surge',
        label: 'Action Surge',
        changes: [{ kind: 'flag', path: 'action_surge', value: true }],
      },
      {
        id: 'feature.second-wind',
        label: 'Second Wind',
        changes: [{ kind: 'value', path: 'heal_bonus', op: 'add', value: 'data.die' }],
      },
    ],
  };

  it('spawns granted effects with cascade source', () => {
    const { engine } = makeEngine(pack, { level: 1, heal_bonus: 0 });
    const parent = engine.applyEffect('class.fighter.level-2', {
      id: 'p-001',
      source: { kind: 'class' },
    });
    const effects = engine.document.effects;
    expect(effects).toHaveLength(3);
    const granted = effects.filter((e) => e.source.kind === 'grant');
    expect(granted.map((e) => e.ref).sort()).toEqual([
      'feature.action-surge',
      'feature.second-wind',
    ]);
    for (const child of granted) expect(child.source.id).toBe(parent.id);

    const computed = engine.compute();
    expect(computed.flags.action_surge).toBe(true);
    expect(computed.values.heal_bonus).toBe(10);
  });

  it('removes granted children when the parent is removed', () => {
    const { engine } = makeEngine(pack, { level: 1 });
    const parent = engine.applyEffect('class.fighter.level-2', {
      id: 'p-001',
      source: { kind: 'class' },
    });
    engine.removeEffect(parent.id);
    expect(engine.document.effects).toHaveLength(0);
  });

  it('cascades grants when removing by source', () => {
    const { engine } = makeEngine(pack, { level: 1 });
    engine.applyEffect('class.fighter.level-2', { id: 'p-001', source: { kind: 'class' } });
    const removed = engine.removeBySource({ kind: 'class' });
    expect(removed).toHaveLength(3);
    expect(engine.document.effects).toHaveLength(0);
  });
});

describe('per-change priority', () => {
  it('orders changes inside a pass by change priority, not definition priority', () => {
    const prioPack: SystemPack = {
      id: 'prio',
      version: '1.0.0',
      definitions: [
        {
          id: 'low-def',
          label: 'low def',
          priority: 1,
          changes: [{ kind: 'value', path: 'trail', op: 'add', value: '1', priority: 20 }],
        },
        {
          id: 'high-def',
          label: 'high def',
          priority: 99,
          changes: [{ kind: 'value', path: 'trail', op: 'add', value: '2', priority: 1 }],
        },
      ],
    };
    const { engine } = makeEngine(prioPack, { trail: 0 });
    engine.applyEffect('low-def', { id: 'a-001' });
    engine.applyEffect('high-def', { id: 'a-002' });
    const addEntries = engine.compute().audit.filter((e) => e.pass === 'add');
    expect(addEntries.map((e) => e.effectId)).toEqual(['a-002', 'a-001']);
  });
});

describe('wildcard roll targets', () => {
  const pack: SystemPack = {
    id: 'wildcards',
    version: '1.0.0',
    rollTemplates: {
      'moves.act-under-fire': {
        expr: { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        tags: ['moves'],
      },
      'moves.go-aggro': {
        expr: { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        tags: ['moves'],
      },
      'saves.defy-danger': {
        expr: { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
      },
    },
    definitions: [
      {
        id: 'state.plus-1-moves',
        label: '+1 to moves',
        changes: [{ kind: 'roll', target: 'moves.*', transform: { bonus: '1' } }],
      },
      {
        id: 'state.lucky',
        label: 'Lucky',
        changes: [{ kind: 'roll', target: '*', transform: { bonus: '1' } }],
      },
    ],
  };

  it('prefix wildcard matches every template under the namespace', () => {
    const { engine } = makeEngine(pack, {});
    engine.applyEffect('state.plus-1-moves', { id: 'a-001' });
    for (const move of ['moves.act-under-fire', 'moves.go-aggro']) {
      const roll = engine.buildRoll(move) as Record<string, any>;
      expect(roll['+'][1]).toBe(1);
    }
    const save = engine.buildRoll('saves.defy-danger') as Record<string, any>;
    expect(save['+']).toBeUndefined();
  });

  it('star wildcard matches everything', () => {
    const { engine } = makeEngine(pack, {});
    engine.applyEffect('state.lucky', { id: 'a-001' });
    const save = engine.buildRoll('saves.defy-danger') as Record<string, any>;
    expect(save['+'][1]).toBe(1);
  });
});

describe('trigger rollInto', () => {
  it('rolls recurring damage straight into a path', () => {
    const pack: SystemPack = {
      id: 'poison',
      version: '1.0.0',
      definitions: [
        {
          id: 'conditions.poisoned',
          label: 'Poisoned',
          triggers: [{ on: 'turn:start', roll: '1d6', rollInto: { path: 'hp.current' } }],
          changes: [],
        },
      ],
    };
    const { engine } = makeEngine(
      pack,
      { hp: { current: 20 } },
      { roller: () => 4 },
    );
    engine.applyEffect('conditions.poisoned', { id: 'a-001' });
    engine.notifyEvent('turn:start');
    expect((engine.document.base.hp as Record<string, unknown>).current).toBe(16);
    engine.notifyEvent('turn:start');
    expect((engine.document.base.hp as Record<string, unknown>).current).toBe(12);
  });
});

describe('world clock', () => {
  it('ticks second-based durations from clock events on the bus', () => {
    const bus = createSheetBus({
      events: { 'clock:tick': v.looseObject({ elapsed: v.number() }) },
    });
    const pack: SystemPack = {
      id: 'clock',
      version: '1.0.0',
      definitions: [
        {
          id: 'spell.long',
          label: 'Long buff',
          duration: { unit: 'seconds', value: 60 },
          changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
        },
      ],
    };
    const { engine } = makeEngine(pack, { score: 0 }, { bus });
    engine.attach();
    engine.applyEffect('spell.long', { id: 'a-001' });
    bus.emit('clock:tick', { elapsed: 30 });
    expect(engine.document.effects).toHaveLength(1);
    bus.emit('clock:tick', { elapsed: 31 });
    expect(engine.document.effects).toHaveLength(0);
  });

  it('emits computed patches when a clock tick expires an effect', () => {
    const bus = createSheetBus({
      events: { 'clock:tick': v.looseObject({ elapsed: v.number() }) },
    });
    const pack: SystemPack = {
      id: 'clock',
      version: '1.0.0',
      definitions: [
        {
          id: 'spell.long',
          label: 'Long buff',
          duration: { unit: 'seconds', value: 60 },
          changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
        },
      ],
    };
    const patches: string[][] = [];
    bus.on('computed', (p) => patches.push(p.patches.map((x) => x.path)));
    const { engine } = makeEngine(pack, { score: 0 }, { bus });
    engine.attach();
    engine.applyEffect('spell.long', { id: 'a-001' });
    patches.length = 0;
    bus.emit('clock:tick', { elapsed: 61 });
    expect(engine.document.effects).toHaveLength(0);
    expect(patches.at(-1)).toEqual(['score']);
  });
});

describe('hydration', () => {
  it('round-trips a document through loadDocument with schema validation', () => {
    const pack: SystemPack = {
      id: 'hydra',
      version: '1.0.0',
      definitions: [
        {
          id: 'buff',
          label: 'Buff',
          changes: [{ kind: 'value', path: 'score', op: 'add', value: '5' }],
        },
      ],
    };
    const source = new SheetEngine(createDocument(pack, { base: { score: 10 } }), { pack });
    source.applyEffect('buff');
    const json = JSON.parse(JSON.stringify(source.document));

    const other = makeEngine(pack, { score: 0 });
    other.engine.loadDocument(json);
    expect(other.engine.compute().values.score).toBe(15);
    expect(other.engine.document.effects).toHaveLength(1);
  });

  it('rejects documents with invalid instance payloads', () => {
    const { engine } = makeEngine({ id: 'x', version: '1.0.0' }, {});
    expect(() =>
      engine.loadDocument({
        systemId: 'x',
        systemVersion: '1.0.0',
        identity: {},
        base: {},
        effects: [{ id: 'not-a-uuid', source: { kind: 'manual' }, enabled: true }],
      }),
    ).toThrow();
  });

  it('round-trips documents produced with a custom uuid-shaped id generator', () => {
    const pack: SystemPack = {
      id: 'hydra-custom',
      version: '1.0.0',
      definitions: [
        {
          id: 'buff',
          label: 'Buff',
          changes: [{ kind: 'value', path: 'score', op: 'add', value: '5' }],
        },
      ],
    };
    const source = makeEngine(pack, { score: 10 });
    source.engine.applyEffect('buff');
    const json = JSON.parse(JSON.stringify(source.engine.document));

    const other = makeEngine(pack, { score: 0 });
    other.engine.loadDocument(json);
    expect(other.engine.compute().values.score).toBe(15);
  });
});

describe('static pack validation', () => {
  it('rejects durations missing the field required by their unit', () => {
    const missingValue: SystemPack = {
      id: 'bad-duration',
      version: '1.0.0',
      definitions: [
        { id: 'a', label: 'a', changes: [], duration: { unit: 'rounds' } },
      ],
    };
    const missingEvent: SystemPack = {
      id: 'bad-duration',
      version: '1.0.0',
      definitions: [
        { id: 'a', label: 'a', changes: [], duration: { unit: 'until-event' } },
      ],
    };
    expect(() => validatePack(missingValue)).toThrow(PackValidationError);
    expect(() => validatePack(missingEvent)).toThrow(PackValidationError);
  });

  it('defineSystemPack is an authoring identity helper', () => {
    const pack: SystemPack = { id: 'authoring', version: '1.0.0' };
    expect(defineSystemPack(pack)).toBe(pack);
  });

  it('rejects invalid expiresAt overrides in applyEffect', () => {
    const { engine } = makeEngine({ id: 'x', version: '1.0.0' }, {});
    engine.registerDefinition({
      id: 'buff',
      label: 'Buff',
      changes: [{ kind: 'value', path: 'score', op: 'add', value: '1' }],
    });
    expect(() =>
      engine.applyEffect('buff', { expiresAt: { unit: 'seconds' } }),
    ).toThrow();
    expect(() =>
      engine.applyEffect('buff', { expiresAt: { unit: 'until-event' } }),
    ).toThrow();
  });

  it('rejects extra bus events that collide with the sheet contract', () => {
    expect(() => createSheetBus({ events: { computed: v.object({}) } })).toThrow(SheetError);
  });

  it('rejects grants pointing at unknown effects', () => {
    const pack: SystemPack = {
      id: 'bad-grants',
      version: '1.0.0',
      definitions: [
        { id: 'a', label: 'a', changes: [], grants: ['does.not-exist'] },
      ],
    };
    expect(() => validatePack(pack)).toThrow(PackValidationError);
  });

  it('rejects triggers referencing unknown effects', () => {
    const pack: SystemPack = {
      id: 'bad-trigger',
      version: '1.0.0',
      definitions: [
        { id: 'a', label: 'a', changes: [], triggers: [{ on: 'x', effect: 'ghost.effect' }] },
      ],
    };
    expect(() => validatePack(pack)).toThrow(PackValidationError);
  });

  it('rejects self-grants', () => {
    const pack: SystemPack = {
      id: 'self-grant',
      version: '1.0.0',
      definitions: [{ id: 'a', label: 'a', changes: [], grants: ['a'] }],
    };
    expect(() => validatePack(pack)).toThrow(PackValidationError);
  });
});

describe('suppressed listing', () => {
  it('reports disabled effects with reason', () => {
    const pack: SystemPack = {
      id: 'suppress',
      version: '1.0.0',
      definitions: [
        { id: 'buff', label: 'Buff', changes: [{ kind: 'value', path: 'x', op: 'add', value: '1' }] },
      ],
    };
    const { engine } = makeEngine(pack, { x: 0 });
    const instance = engine.applyEffect('buff', { id: 'a-001' });
    engine.setEnabled(instance.id, false);
    const computed = engine.compute();
    expect(computed.effects).toHaveLength(0);
    expect(computed.suppressed).toEqual([
      { instance: expect.objectContaining({ id: 'a-001' }), reason: 'disabled' },
    ]);
    expect(computed.values.x).toBe(0);
  });
});

describe('document shape', () => {
  it('keeps the minimal effects-oriented document', () => {
    const document = createDocument(
      { id: 'dnd5e', version: '1.3.0' },
      { identity: { name: 'Vex' }, base: { abilities: { str: 16, dex: 14 } } },
    );
    expect(Object.keys(document).sort()).toEqual([
      'base',
      'effects',
      'identity',
      'systemId',
      'systemVersion',
    ]);
  });
});
