import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import type { SystemPack } from '../src';
import { makeEngine } from './helpers';

const apocalypseWorld: SystemPack = {
  id: 'apocalypse-world-2e',
  version: '1.0.0',
  derived: {
    harm_clock: 'floor(harm / 2)',
  },
  rollTemplates: {
    'move.act-under-fire': {
      expr: {
        '+': [
          { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
          { var: 'stats.cool' },
        ],
      },
      tags: ['moves'],
    },
    'move.go-aggro': {
      expr: {
        '+': [
          { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
          { var: 'stats.hard' },
        ],
      },
      tags: ['moves'],
    },
  },
  definitions: [
    {
      id: 'state.plus-1-forward',
      label: '+1 forward',
      duration: { unit: 'until-event', event: 'move:resolved' },
      changes: [{ kind: 'roll', target: 'moves', transform: { bonus: '1' } }],
    },
    {
      id: 'state.unstable',
      label: 'Unstable (harm 4+)',
      condition: 'harm >= 4',
      changes: [{ kind: 'flag', path: 'unstable', value: true }],
    },
    {
      id: 'highlight.stat',
      label: 'Highlighted stat',
      triggers: [
        {
          on: 'move:miss',
          changes: [{ kind: 'value', path: 'xp', op: 'add', value: '1' }],
        },
      ],
      changes: [],
    },
    {
      id: 'move.read-person',
      label: 'Read a person (hold)',
      changes: [{ kind: 'value', path: 'hold', op: 'set', value: 'data.hold' }],
    },
    {
      id: 'playbook.battlebabe.custom-weapon',
      label: 'Custom weapon',
      changes: [
        { kind: 'flag', path: 'weapons.custom', value: 'mg-42' },
        {
          kind: 'roll',
          target: 'move.go-aggro',
          transform: { extraDice: [{ count: 1, faces: 6 }] },
        },
      ],
    },
  ],
};

const base = {
  stats: { cool: 1, hard: 0, hot: -1, sharp: 2, weird: 1 },
  harm: 0,
  xp: 0,
  hold: 0,
};

describe('Apocalypse World (PbtA)', () => {
  it('rolls 2d6 + stat from a five-stat document', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    const result = evaluateRoll(engine.buildRoll('move.act-under-fire'), {
      scope: engine.compute().scope,
      seed: 'aw-1',
    });
    expect(result.terms[0]!.dice).toHaveLength(2);
    expect(result.value).toBeGreaterThanOrEqual(3);
    expect(result.value).toBeLessThanOrEqual(13);
  });

  it('+1 forward applies to every move and expires when the move resolves', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    engine.applyEffect('state.plus-1-forward', { id: 'a-001' });
    for (const move of ['move.act-under-fire', 'move.go-aggro']) {
      const roll = engine.buildRoll(move) as Record<string, any>;
      expect(roll['+'][1]).toBe(1);
    }
    engine.notifyEvent('move:resolved');
    const roll = engine.buildRoll('move.act-under-fire') as Record<string, any>;
    expect(roll['+'][1]).toEqual({ var: 'stats.cool' });
  });

  it('harm >= 4 flags the character as unstable and derives the harm clock', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    engine.applyEffect('state.unstable', { id: 'a-001' });
    expect(engine.compute().flags.unstable).toBeUndefined();
    engine.updateBase((b) => ({ ...b, harm: 5 }));
    const computed = engine.compute();
    expect(computed.flags.unstable).toBe(true);
    expect((computed.values as Record<string, any>).harm_clock).toBe(2);
  });

  it('misses on highlighted stats mark xp via trigger', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    engine.applyEffect('highlight.stat', { id: 'a-001' });
    engine.notifyEvent('move:miss', { move: 'move.act-under-fire' });
    engine.notifyEvent('move:miss', { move: 'move.go-aggro' });
    expect(engine.document.base.xp).toBe(2);
  });

  it('hold is instance data written by the move effect', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    engine.applyEffect('move.read-person', { id: 'a-001', data: { hold: 3 } });
    expect(engine.compute().values.hold).toBe(3);
  });

  it('playbook gear adds a die to a specific move only', () => {
    const { engine } = makeEngine(apocalypseWorld, structuredClone(base));
    engine.applyEffect('playbook.battlebabe.custom-weapon', { id: 'a-001' });
    const aggro = engine.buildRoll('move.go-aggro') as Record<string, any>;
    expect(aggro['+'][1]).toMatchObject({ type: 'die', count: 1, faces: { value: 6 } });
    const actUnderFire = engine.buildRoll('move.act-under-fire') as Record<string, any>;
    expect(actUnderFire['+'][1]).toEqual({ var: 'stats.cool' });
    expect((engine.compute().flags.weapons as Record<string, unknown>).custom).toBe('mg-42');
  });
});
