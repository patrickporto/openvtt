import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const coc: SystemPack = {
  id: 'call-of-cthulhu-7e',
  version: '1.0.0',
  derived: {
    'hp.max': 'floor((con + siz) / 10)',
    'skills.spot_hidden_hard': 'floor(skills.spot_hidden / 2)',
    'skills.spot_hidden_extreme': 'floor(skills.spot_hidden / 5)',
  },
  rollTemplates: {
    skill: {
      expr: { type: 'die', count: 1, faces: { kind: 'percentile' } },
      tags: ['skill'],
    },
  },
  definitions: [
    {
      id: 'circumstance.bonus-die',
      label: 'Bonus die',
      changes: [
        {
          kind: 'roll',
          target: 'skill',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-lowest', count: 1 }] },
        },
      ],
    },
    {
      id: 'circumstance.penalty-die',
      label: 'Penalty die',
      stacking: { group: 'circumstance-dice', mode: 'highest-priority' },
      priority: 2,
      changes: [
        {
          kind: 'roll',
          target: 'skill',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 1 }] },
        },
      ],
    },
    {
      id: 'conditions.major-wound',
      label: 'Major wound',
      condition: 'hp.current < hp.max / 2',
      changes: [{ kind: 'flag', path: 'major_wound', value: true }],
    },
    {
      id: 'conditions.dying',
      label: 'Dying',
      condition: 'hp.current <= 0',
      changes: [{ kind: 'flag', path: 'dying', value: true }],
    },
    {
      id: 'mythos.elder-sign',
      label: 'Cast Elder Sign',
      triggers: [
        {
          on: 'spell:cast',
          changes: [{ kind: 'value', path: 'san', op: 'add', value: '-data.cost' }],
        },
      ],
      changes: [],
    },
  ],
};

const base = {
  con: 50,
  siz: 60,
  san: 55,
  hp: { current: 7 },
  skills: { spot_hidden: 50 },
};

describe('Call of Cthulhu 7e', () => {
  it('derives hp.max and success thresholds from characteristics', () => {
    const { engine } = makeEngine(coc, structuredClone(base));
    const values = engine.compute().values as Record<string, any>;
    expect(values.hp.max).toBe(11);
    expect(values.skills.spot_hidden_hard).toBe(25);
    expect(values.skills.spot_hidden_extreme).toBe(10);
  });

  it('bonus die is 2d100 keep-lowest as an IR transform', () => {
    const { engine } = makeEngine(coc, structuredClone(base));
    engine.applyEffect('circumstance.bonus-die', { id: 'a-001' });
    const roll = engine.buildRoll('skill') as Record<string, any>;
    expect(roll).toMatchObject({
      type: 'die',
      count: 2,
      faces: { kind: 'percentile' },
      modifiers: [{ op: 'keep-lowest', count: 1 }],
    });
    const result = evaluateRoll(roll, { seed: 'coc-1' });
    expect(result.terms[0]!.dice).toHaveLength(2);
    expect(result.terms[0]!.dice.filter((d) => d.kept)).toHaveLength(1);
  });

  it('major wound flips on when damage crosses the half-hp threshold', () => {
    const { engine, document } = makeEngine(coc, structuredClone(base));
    engine.applyEffect('conditions.major-wound', { id: 'a-001' });
    engine.applyEffect('conditions.dying', { id: 'a-002' });
    expect(engine.compute().flags.major_wound).toBeUndefined();

    (document.base.hp as Record<string, unknown>).current = 4;
    engine.refresh();
    expect(engine.compute().flags.major_wound).toBe(true);
    expect(engine.compute().flags.dying).toBeUndefined();

    (document.base.hp as Record<string, unknown>).current = 0;
    engine.refresh();
    expect(engine.compute().flags.dying).toBe(true);
  });

  it('spells cost sanity via instance-parametrized triggers', () => {
    const { engine, document } = makeEngine(coc, structuredClone(base));
    engine.applyEffect('mythos.elder-sign', { id: 'a-001', data: { cost: 3 } });
    engine.notifyEvent('spell:cast');
    expect(document.base.san).toBe(52);
  });

  it('stacking rules let a penalty die override a bonus die', () => {
    const stacked: SystemPack = {
      ...coc,
      definitions: coc.definitions!.map((def) =>
        def.id === 'circumstance.bonus-die'
          ? { ...def, stacking: { group: 'circumstance-dice' as const, mode: 'highest-priority' as const }, priority: 1 }
          : def,
      ),
    };
    const { engine } = makeEngine(stacked, structuredClone(base));
    engine.applyEffect('circumstance.bonus-die', { id: 'a-001' });
    engine.applyEffect('circumstance.penalty-die', { id: 'a-002' });
    const roll = engine.buildRoll('skill') as Record<string, any>;
    expect(roll.modifiers).toEqual([{ op: 'keep-highest', count: 1 }]);
  });
});
