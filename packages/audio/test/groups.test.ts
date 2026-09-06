import { describe, expect, it } from 'bun:test';
import { GroupRegistry } from '../src/groups';

describe('GroupRegistry', () => {
  it('define, lista e remove grupos', () => {
    const registry = new GroupRegistry();
    const id = registry.define({ members: ['a', 'b', 'c'] });
    expect(registry.list()).toEqual([id]);
    expect(registry.get(id)).toMatchObject({ members: ['a', 'b', 'c'], noRepeat: true });
    expect(registry.remove(id)).toBe(true);
    expect(registry.get(id)).toBeUndefined();
  });

  it('pick retorna sempre um membro', () => {
    const registry = new GroupRegistry();
    const id = registry.define({ members: ['a', 'b', 'c'] });
    for (let i = 0; i < 20; i++) {
      const pick = registry.pick(id);
      expect(['a', 'b', 'c']).toContain(pick);
    }
  });

  it('noRepeat evita repetição imediata', () => {
    const registry = new GroupRegistry();
    const id = registry.define({ members: ['a', 'b'], noRepeat: true });
    let previous: string | null = null;
    for (let i = 0; i < 30; i++) {
      const pick = registry.pick(id)!;
      expect(pick).not.toBe(previous);
      previous = pick;
    }
  });

  it('noRepeat=false permite repetição e grupo unitário repete', () => {
    const registry = new GroupRegistry();
    const free = registry.define({ members: ['a', 'b'], noRepeat: false });
    let sawRepeat = false;
    let previous: string | null = null;
    for (let i = 0; i < 50; i++) {
      const pick = registry.pick(free)!;
      if (pick === previous) sawRepeat = true;
      previous = pick;
    }
    expect(sawRepeat).toBe(true);

    const single = registry.define({ members: ['only'], noRepeat: true });
    expect(registry.pick(single)).toBe('only');
    expect(registry.pick(single)).toBe('only');
  });

  it('pick de grupo desconhecido retorna null', () => {
    expect(new GroupRegistry().pick('missing')).toBeNull();
  });

  it('addMembers não duplica e falha para grupo desconhecido', () => {
    const registry = new GroupRegistry();
    const id = registry.define({ members: ['a'] });
    registry.addMembers(id, ['a', 'b']);
    expect(registry.get(id)?.members).toEqual(['a', 'b']);
    expect(() => registry.addMembers('missing', ['x'])).toThrow();
  });
});
