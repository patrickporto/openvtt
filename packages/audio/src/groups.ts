import * as v from 'valibot';
import { newId } from '@openvtt/events';
import { SoundGroupSchema, type SoundGroup, type SoundGroupInput } from './schemas';

interface GroupEntry {
  id: string;
  members: string[];
  noRepeat: boolean;
  lastPick: string | null;
}

export class GroupRegistry {
  private readonly groups = new Map<string, GroupEntry>();

  define(input: SoundGroupInput): string {
    const group = v.parse(SoundGroupSchema, input);
    const id = group.id ?? newId();
    this.groups.set(id, { id, members: [...group.members], noRepeat: group.noRepeat, lastPick: null });
    return id;
  }

  get(id: string): SoundGroup | undefined {
    const group = this.groups.get(id);
    if (!group) return undefined;
    return { id: group.id, members: [...group.members], noRepeat: group.noRepeat };
  }

  list(): string[] {
    return [...this.groups.keys()];
  }

  remove(id: string): boolean {
    return this.groups.delete(id);
  }

  addMembers(id: string, members: readonly string[]): void {
    const group = this.groups.get(id);
    if (!group) throw new Error(`Unknown audio group "${id}".`);
    for (const member of members) {
      if (!group.members.includes(member)) group.members.push(member);
    }
  }

  pick(id: string): string | null {
    const group = this.groups.get(id);
    if (!group) return null;
    const candidates =
      group.noRepeat && group.lastPick !== null && group.members.length > 1
        ? group.members.filter((member) => member !== group.lastPick)
        : group.members;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    if (picked === undefined) return null;
    group.lastPick = picked;
    return picked;
  }

  clear(): void {
    this.groups.clear();
  }
}
