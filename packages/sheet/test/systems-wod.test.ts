import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const mundoDasTrevas: SystemPack = {
  id: 'mundo-das-trevas-v20',
  version: '1.0.0',
  derived: {
    'pools.melee': 'attributes.strength + abilities.brawl + pool_bonus',
    'pools.soak': 'attributes.stamina + armor',
  },
  rollTemplates: {
    'attack.melee': {
      expr: {
        type: 'die',
        count: { var: 'pools.melee' },
        faces: { kind: 'number', value: 10 },
        modifiers: [{ op: 'count-success', compare: { op: '>=', value: 6 } }],
      },
      tags: ['pool', 'attack'],
    },
  },
  definitions: [
    {
      id: 'wound.injured',
      label: 'Injured (-1)',
      condition: 'health.damage >= 2',
      changes: [{ kind: 'value', path: 'pool_bonus', op: 'add', value: '-1' }],
    },
    {
      id: 'wound.mauled',
      label: 'Mauled (-2 total)',
      condition: 'health.damage >= 4',
      changes: [{ kind: 'value', path: 'pool_bonus', op: 'add', value: '-1' }],
    },
    {
      id: 'state.frenzy-prone',
      label: 'Frenzy prone',
      condition: 'humanity < 4',
      changes: [{ kind: 'flag', path: 'frenzy_prone', value: true }],
    },
    {
      id: 'discipline.potence',
      label: 'Potence',
      changes: [{ kind: 'value', path: 'attributes.strength', op: 'add', value: 'data.dots' }],
    },
    {
      id: 'item.kevlar',
      label: 'Kevlar vest',
      changes: [{ kind: 'value', path: 'armor', op: 'add', value: '3' }],
    },
    {
      id: 'state.giant-size',
      label: 'Giant size',
      changes: [
        {
          kind: 'roll',
          target: 'pool',
          transform: { addDice: 2 },
        },
      ],
    },
  ],
};

const base = {
  attributes: { strength: 3, stamina: 2 },
  abilities: { brawl: 2 },
  health: { damage: 0, max: 7 },
  humanity: 7,
  armor: 0,
  pool_bonus: 0,
};

describe('Mundo das Trevas (V20)', () => {
  it('builds dice pools from derived formulas and rolls count-success', () => {
    const { engine } = makeEngine(mundoDasTrevas, structuredClone(base));
    expect((engine.compute().values as Record<string, any>).pools.melee).toBe(5);
    const result = evaluateRoll(engine.buildRoll('attack.melee'), {
      scope: engine.compute().scope,
      seed: 'wod-1',
    });
    expect(result.rolls).toHaveLength(5);
    expect(result.terms[0]!.applied).toContain('count-success');
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(5);
  });

  it('wound penalties shrink the pool progressively', () => {
    const { engine, document } = makeEngine(mundoDasTrevas, structuredClone(base));
    engine.applyEffect('wound.injured', { id: 'a-001' });
    engine.applyEffect('wound.mauled', { id: 'a-002' });

    (document.base.health as Record<string, unknown>).damage = 2;
    engine.refresh();
    expect((engine.compute().values as Record<string, any>).pools.melee).toBe(4);

    (document.base.health as Record<string, unknown>).damage = 5;
    engine.refresh();
    expect((engine.compute().values as Record<string, any>).pools.melee).toBe(3);

    (document.base.health as Record<string, unknown>).damage = 0;
    engine.refresh();
    expect((engine.compute().values as Record<string, any>).pools.melee).toBe(5);
  });

  it('low humanity flags frenzy propensity', () => {
    const { engine, document } = makeEngine(mundoDasTrevas, structuredClone(base));
    engine.applyEffect('state.frenzy-prone', { id: 'a-001' });
    expect(engine.compute().flags.frenzy_prone).toBeUndefined();
    document.base.humanity = 3;
    engine.refresh();
    expect(engine.compute().flags.frenzy_prone).toBe(true);
  });

  it('disciplines are parametrized effects (potence dots) that grow the pool', () => {
    const { engine } = makeEngine(mundoDasTrevas, structuredClone(base));
    engine.applyEffect('discipline.potence', { id: 'a-001', data: { dots: 2 } });
    expect((engine.compute().values as Record<string, any>).pools.melee).toBe(7);
  });

  it('roll effects add raw dice to any pool template (giant size)', () => {
    const { engine } = makeEngine(mundoDasTrevas, structuredClone(base));
    engine.applyEffect('state.giant-size', { id: 'a-001' });
    const roll = engine.buildRoll('attack.melee') as Record<string, any>;
    expect(roll.count).toEqual({ '+': [{ var: 'pools.melee' }, 2] });
    const result = evaluateRoll(roll, { scope: engine.compute().scope, seed: 'wod-2' });
    expect(result.rolls).toHaveLength(7);
  });

  it('armor feeds the soak pool through the derived graph', () => {
    const { engine } = makeEngine(mundoDasTrevas, structuredClone(base));
    engine.applyEffect('item.kevlar', { id: 'a-001', source: { kind: 'equipment' } });
    expect((engine.compute().values as Record<string, any>).pools.soak).toBe(5);
    engine.removeBySource({ kind: 'equipment' });
    expect((engine.compute().values as Record<string, any>).pools.soak).toBe(2);
  });
});
