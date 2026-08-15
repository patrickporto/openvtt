import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const fate: SystemPack = {
  id: 'fate-core',
  version: '1.0.0',
  derived: {
    'approaches.clever_total': 'approaches.clever + clever_bonus',
  },
  rollTemplates: {
    'action.clever': {
      expr: {
        '+': [
          { type: 'die', count: 4, faces: { kind: 'fate' } },
          { var: 'approaches.clever_total' },
        ],
      },
      tags: ['fate', 'action'],
    },
  },
  definitions: [
    {
      id: 'aspect.guardian-of-the-gate',
      label: 'Aspect: Guardian of the Gate',
      changes: [{ kind: 'flag', path: 'aspects.guardian', value: true }],
    },
    {
      id: 'invoke.aspect',
      label: 'Invoke aspect (+2)',
      changes: [{ kind: 'roll', target: 'fate', transform: { bonus: '2' } }],
    },
    {
      id: 'stunt.footswork',
      label: 'Stunt: free invoke',
      condition: 'free_invokes > 0',
      changes: [{ kind: 'value', path: 'clever_bonus', op: 'add', value: '2' }],
    },
    {
      id: 'meta.compel',
      label: 'Compel accepted',
      triggers: [
        {
          on: 'compel',
          changes: [{ kind: 'value', path: 'fate_points', op: 'add', value: '1' }],
        },
      ],
      changes: [],
    },
  ],
};

const base = {
  approaches: { careful: 1, clever: 2, flashy: 3, forceful: 0, quick: 2, sneaky: 1 },
  clever_bonus: 0,
  fate_points: 3,
  free_invokes: 0,
};

describe('FATE Core', () => {
  it('rolls 4dF + approach from a minimal ladder document', () => {
    const { engine } = makeEngine(fate, structuredClone(base));
    const result = evaluateRoll(engine.buildRoll('action.clever'), {
      scope: engine.compute().scope,
      seed: 'fate-1',
    });
    expect(result.terms[0]!.dice).toHaveLength(4);
    for (const die of result.terms[0]!.dice) {
      expect([-1, 0, 1]).toContain(die.value);
    }
    expect(result.value).toBeGreaterThanOrEqual(-2);
    expect(result.value).toBeLessThanOrEqual(6);
  });

  it('create advantage plants a flag; invoke adds +2 and is consumed on removal', () => {
    const { engine } = makeEngine(fate, structuredClone(base));
    engine.applyEffect('aspect.guardian-of-the-gate', { id: 'a-001', source: { kind: 'scene' } });
    expect((engine.compute().flags.aspects as Record<string, unknown>).guardian).toBe(true);

    const invoke = engine.applyEffect('invoke.aspect', { id: 'a-002', source: { kind: 'invoke' } });
    const withInvoke = engine.buildRoll('action.clever') as Record<string, any>;
    expect(withInvoke['+'][1]).toBe(2);

    engine.removeEffect(invoke.id);
    const without = engine.buildRoll('action.clever') as Record<string, any>;
    expect(without['+'][1]).toEqual({ var: 'approaches.clever_total' });
  });

  it('stunts gate on free invokes through a plain condition', () => {
    const { engine } = makeEngine(fate, structuredClone(base));
    engine.applyEffect('stunt.footswork', { id: 'a-001' });
    expect((engine.compute().values as Record<string, any>).approaches.clever_total).toBe(2);
    engine.updateBase((b) => ({ ...b, free_invokes: 1 }));
    expect((engine.compute().values as Record<string, any>).approaches.clever_total).toBe(4);
  });

  it('compels pay out fate points through a declarative trigger', () => {
    const { engine } = makeEngine(fate, structuredClone(base));
    engine.applyEffect('meta.compel', { id: 'a-001' });
    engine.notifyEvent('compel', { aspect: 'aspects.guardian' });
    expect(engine.document.base.fate_points).toBe(4);
  });
});
