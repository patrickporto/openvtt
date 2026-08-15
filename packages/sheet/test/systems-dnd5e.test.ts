import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const dnd5e: SystemPack = {
  id: 'dnd5e',
  version: '1.3.0',
  derived: {
    'mods.str': 'floor((abilities.str - 10) / 2)',
    'mods.dex': 'floor((abilities.dex - 10) / 2)',
    proficiency: '2 + floor((level - 1) / 4)',
    attack_mod: 'mods.str + proficiency + attack_bonus',
    ac: '10 + mods.dex + ac_bonus',
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
    'damage.longsword': {
      expr: {
        '+': [
          { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
          { var: 'mods.str' },
        ],
      },
      tags: ['damage'],
    },
  },
  definitions: [
    {
      id: 'class.fighter.level-3',
      label: 'Fighter 3',
      changes: [{ kind: 'value', path: 'level', op: 'set', value: '3' }],
    },
    {
      id: 'class.fighter.level-5',
      label: 'Fighter 5',
      changes: [{ kind: 'value', path: 'level', op: 'set', value: '5' }],
    },
    {
      id: 'item.longsword+1',
      label: 'Longsword +1',
      changes: [{ kind: 'value', path: 'attack_bonus', op: 'add', value: '1' }],
    },
    {
      id: 'item.shield',
      label: 'Shield',
      changes: [{ kind: 'value', path: 'ac_bonus', op: 'add', value: '2' }],
    },
    {
      id: 'conditions.blessed',
      label: 'Blessed',
      duration: { unit: 'rounds', value: 10 },
      changes: [
        {
          kind: 'roll',
          target: 'attacks',
          transform: { extraDice: [{ count: 1, faces: 4 }] },
        },
      ],
    },
    {
      id: 'conditions.advantage',
      label: 'Advantage',
      changes: [
        {
          kind: 'roll',
          target: 'attack',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 1 }] },
        },
      ],
    },
    {
      id: 'features.rage',
      label: 'Rage',
      condition: 'not flags.unconscious',
      changes: [
        { kind: 'flag', path: 'rage', value: true },
        { kind: 'value', path: 'damage_bonus', op: 'add', value: '2' },
      ],
    },
    {
      id: 'conditions.unconscious',
      label: 'Unconscious',
      changes: [{ kind: 'flag', path: 'unconscious', value: true }],
    },
    {
      id: 'conditions.bloodied',
      label: 'Bloodied',
      condition: 'hp.current < hp.max / 2',
      changes: [{ kind: 'flag', path: 'bloodied', value: true }],
    },
  ],
};

const vexBase = {
  abilities: { str: 16, dex: 14 },
  level: 1,
  attack_bonus: 0,
  damage_bonus: 0,
  ac_bonus: 0,
  hp: { current: 12, max: 12 },
};

describe('D&D 5e', () => {
  it('derives mods, proficiency and attack mod from a minimal document', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('class.fighter.level-3', { id: '0191-aaa', source: { kind: 'class' } });
    engine.applyEffect('item.longsword+1', { id: '0192-bbb', source: { kind: 'equipment' } });
    const values = engine.compute().values as Record<string, any>;
    expect(values.mods.str).toBe(3);
    expect(values.mods.dex).toBe(2);
    expect(values.proficiency).toBe(2);
    expect(values.attack_mod).toBe(6);
  });

  it('computes AC with equipment and answers "why" via the audit trail', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('item.shield', { id: 'a-001', source: { kind: 'equipment' } });
    const computed = engine.compute();
    expect(computed.values.ac).toBe(14);
    const why = computed.audit.filter((e) => e.path === 'ac_bonus' || e.path === 'ac');
    expect(why).toHaveLength(2);
    expect(why[0]).toMatchObject({ ref: 'item.shield', pass: 'add', input: 2, result: 2 });
    expect(why[1]).toMatchObject({ pass: 'derived', result: 14 });
  });

  it('advantage is an IR transform: 1d20 becomes 2d20kh1', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('conditions.advantage', { id: 'a-001' });
    const roll = engine.buildRoll('attack') as Record<string, any>;
    expect(roll['+'][0]).toMatchObject({
      type: 'die',
      count: 2,
      modifiers: [{ op: 'keep-highest', count: 1 }],
    });
  });

  it('bless adds 1d4 to every attack roll and expires after 10 rounds', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('class.fighter.level-3', { id: 'a-001', source: { kind: 'class' } });
    engine.applyEffect('conditions.blessed', {
      id: 'a-002',
      source: { kind: 'spell', id: 'cleric-7' },
    });
    const roll = engine.buildRoll('attack');
    const result = evaluateRoll(roll, { scope: engine.compute().scope, seed: 'vex-1' });
    expect(result.terms).toHaveLength(2);
    expect(result.value).toBeGreaterThanOrEqual(1 + 1 + 5);
    expect(result.value).toBeLessThanOrEqual(20 + 4 + 5);
    for (let i = 0; i < 10; i++) engine.notifyEvent('round:end');
    expect(engine.document.effects.find((e) => e.ref === 'conditions.blessed')).toBeUndefined();
    expect(engine.buildRoll('attack')).toEqual(dnd5e.rollTemplates!.attack!.expr);
  });

  it('rage shuts itself off when the character falls unconscious', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    const rage = engine.applyEffect('features.rage', { id: 'a-001' });
    expect(engine.compute().flags.rage).toBe(true);
    engine.applyEffect('conditions.unconscious', { id: 'a-002' });
    const computed = engine.compute();
    expect(computed.flags.unconscious).toBe(true);
    expect(computed.flags.rage).toBeUndefined();
    expect(computed.effects.map((e) => e.id)).not.toContain(rage.id);
    expect(computed.suppressed).toContainEqual({
      instance: expect.objectContaining({ id: rage.id }),
      reason: 'condition',
    });
    expect((computed.values as Record<string, any>).damage_bonus).toBe(0);
  });

  it('bloodied turns on below half hp and off again after healing', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('conditions.bloodied', { id: 'a-001' });
    expect(engine.compute().flags.bloodied).toBeUndefined();
    engine.updateBase((b) => {
      (b.hp as Record<string, unknown>).current = 5;
      return b;
    });
    expect(engine.compute().flags.bloodied).toBe(true);
    engine.updateBase((b) => {
      (b.hp as Record<string, unknown>).current = 12;
      return b;
    });
    expect(engine.compute().flags.bloodied).toBeUndefined();
  });

  it('level up = swap class effect; proficiency follows', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    engine.applyEffect('class.fighter.level-3', { id: 'a-001', source: { kind: 'class' } });
    expect(engine.compute().values.proficiency).toBe(2);
    engine.removeBySource({ kind: 'class' });
    engine.applyEffect('class.fighter.level-5', { id: 'a-002', source: { kind: 'class' } });
    const values = engine.compute().values as Record<string, any>;
    expect(values.level).toBe(5);
    expect(values.proficiency).toBe(3);
    expect(values.attack_mod).toBe(6);
  });

  it('damage rolls embed mods.str from the derived graph', () => {
    const { engine } = makeEngine(dnd5e, structuredClone(vexBase));
    const result = evaluateRoll(engine.buildRoll('damage.longsword'), {
      scope: engine.compute().scope,
      seed: 'dmg',
    });
    expect(result.value).toBeGreaterThanOrEqual(4);
    expect(result.value).toBeLessThanOrEqual(11);
  });
});
