import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const savageWorlds: SystemPack = {
  id: 'savage-worlds',
  version: '1.0.0',
  ordinals: {
    traitDice: ['d4', 'd6', 'd8', 'd10', 'd12', 'd12+1', 'd12+2'],
  },
  derived: {
    parry: '2 + fightDie / 2 + parry_bonus',
    toughness: '2 + vigorDie / 2 + armor',
    'dice.agilityFaces': 'dieFaces.agility',
  },
  rollTemplates: {
    'trait.agility': {
      expr: {
        type: 'die',
        count: 1,
        faces: { kind: 'expr', value: { var: 'dice.agilityFaces' } },
        modifiers: [{ op: 'explode' }],
      },
      tags: ['trait'],
    },
  },
  definitions: [
    {
      id: 'template.warrior',
      label: 'Warrior template',
      changes: [
        { kind: 'value', path: 'fightDie', op: 'set', value: '10' },
        { kind: 'value', path: 'vigorDie', op: 'set', value: '8' },
      ],
    },
    {
      id: 'cyberware.muscle-graft',
      label: 'Muscle graft',
      changes: [{ kind: 'value', path: 'traits.agility', op: 'upgrade', value: 'traitDice', steps: 2 }],
    },
    {
      id: 'injury.bum-leg',
      label: 'Bum leg',
      changes: [{ kind: 'value', path: 'traits.agility', op: 'downgrade', value: 'traitDice' }],
    },
    {
      id: 'item.leather-armor',
      label: 'Leather armor',
      changes: [{ kind: 'value', path: 'armor', op: 'add', value: '2' }],
    },
    {
      id: 'state.shaken-recovery',
      label: 'Focus',
      changes: [{ kind: 'value', path: 'parry_bonus', op: 'add', value: '2' }],
    },
    {
      id: 'state.incapacitated',
      label: 'Incapacitated',
      condition: 'wounds >= 3',
      changes: [{ kind: 'flag', path: 'incapacitated', value: true }],
    },
    {
      id: 'state.wound-penalty',
      label: 'Wound penalty',
      condition: 'wounds >= 1',
      changes: [
        { kind: 'roll', target: 'trait', transform: { bonus: '-wounds' } },
      ],
    },
    {
      id: 'rule.wild-die',
      label: 'Wild die',
      changes: [
        {
          kind: 'roll',
          target: 'trait.agility',
          transform: { extraDice: [{ count: 1, faces: 6, modifiers: [{ op: 'explode' }] }] },
        },
      ],
    },
  ],
};

const base = {
  traits: { agility: 'd6' },
  dieFaces: { agility: 6 },
  fightDie: 4,
  vigorDie: 6,
  armor: 0,
  parry_bonus: 0,
  wounds: 0,
};

describe('Savage Worlds', () => {
  it('upgrades and downgrades trait dice along the ordinal ladder', () => {
    const { engine } = makeEngine(savageWorlds, structuredClone(base));
    engine.applyEffect('cyberware.muscle-graft', { id: 'a-001' });
    expect((engine.compute().values as Record<string, any>).traits.agility).toBe('d10');
    engine.applyEffect('injury.bum-leg', { id: 'a-002' });
    expect((engine.compute().values as Record<string, any>).traits.agility).toBe('d8');
  });

  it('clamps at the top of the ladder (d12+2)', () => {
    const { engine } = makeEngine(savageWorlds, {
      ...structuredClone(base),
      traits: { agility: 'd12+2' },
    });
    engine.applyEffect('cyberware.muscle-graft', { id: 'a-001' });
    expect((engine.compute().values as Record<string, any>).traits.agility).toBe('d12+2');
  });

  it('derives parry and toughness from template stats and equipment', () => {
    const { engine } = makeEngine(savageWorlds, structuredClone(base));
    engine.applyEffect('template.warrior', { id: 'a-001' });
    engine.applyEffect('item.leather-armor', { id: 'a-002', source: { kind: 'equipment' } });
    engine.applyEffect('state.shaken-recovery', { id: 'a-003' });
    const values = engine.compute().values as Record<string, any>;
    expect(values.parry).toBe(9);
    expect(values.toughness).toBe(8);
  });

  it('incapacitates at 3 wounds and wounds penalize trait rolls via IR bonus', () => {
    const { engine, document } = makeEngine(savageWorlds, structuredClone(base));
    engine.applyEffect('state.incapacitated', { id: 'a-001' });
    engine.applyEffect('state.wound-penalty', { id: 'a-002' });
    expect(engine.compute().flags.incapacitated).toBeUndefined();
    expect(engine.compute().rollTransforms).toHaveLength(0);

    document.base.wounds = 3;
    engine.refresh();
    const computed = engine.compute();
    expect(computed.flags.incapacitated).toBe(true);
    expect(computed.rollTransforms).toHaveLength(1);
    const roll = engine.buildRoll('trait.agility') as Record<string, any>;
    expect(roll['+'][1]).toEqual({ '-': [{ var: 'wounds' }] });
  });

  it('wild die is an extra exploding d6 appended to the trait roll', () => {
    const { engine } = makeEngine(savageWorlds, structuredClone(base));
    engine.applyEffect('rule.wild-die', { id: 'a-001' });
    const roll = engine.buildRoll('trait.agility');
    const result = evaluateRoll(roll, { scope: engine.compute().scope, seed: 'sw-1' });
    expect(result.terms).toHaveLength(2);
    const [trait, wild] = result.terms;
    expect(trait!.dice[0]!.value).toBeGreaterThanOrEqual(1);
    expect(trait!.dice[0]!.value).toBeLessThanOrEqual(6 * 10);
    expect(wild!.applied).toContain('explode');
  });
});
