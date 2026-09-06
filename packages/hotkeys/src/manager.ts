import * as v from 'valibot';
import { createBus, defineContract, type EventBus } from '@openvtt/events';
import { InvalidProfileError, HotkeysError } from './errors';
import { KeyEngine } from './engine';
import type { KeyboardTarget, EngineOptions } from './engine';
import { ActionRegistry, toInfo, toKeyBinds } from './registry';
import type { ActionDef, ActionInfo, HotkeyConflict, RegisteredAction } from './registry';
import { comboId } from './keys';
import type { ComboInput, MinimalKeyboardEvent } from './keys';
import type { HotkeyEventMap, HotkeyHookMap, HotkeyProfile, KeyBind } from './schema';
import { BeforeHotkeySchema, BindsChangedSchema, ContextsChangedSchema, HotkeyErrorEventSchema, HotkeyProfileSchema, HotkeyTriggeredSchema } from './schema';

export interface HotkeyManagerOptions extends EngineOptions {
  namespace?: string;
  bus?: EventBus<HotkeyEventMap, HotkeyHookMap>;
}

export class HotkeyManager {
  readonly bus: EventBus<HotkeyEventMap, HotkeyHookMap>;

  private readonly registry = new ActionRegistry();
  private readonly engine: KeyEngine;
  private readonly ownsBus: boolean;
  private destroyed = false;

  constructor(options: HotkeyManagerOptions = {}) {
    if (options.bus) {
      this.bus = options.bus;
      this.ownsBus = false;
    } else {
      this.bus = createBus<HotkeyEventMap, HotkeyHookMap>(
        defineContract({
          namespace: options.namespace ?? 'openvtt',
          events: {
            hotkeyTriggered: HotkeyTriggeredSchema,
            bindsChanged: BindsChangedSchema,
            contextsChanged: ContextsChangedSchema,
            hotkeyError: HotkeyErrorEventSchema,
          },
          hooks: {
            beforeHotkey: { strategy: 'syncWaterfall', schema: BeforeHotkeySchema },
          },
        }),
      );
      this.ownsBus = true;
    }
    this.engine = new KeyEngine(this.registry, this.bus, options);
  }

  register(namespace: string, action: string, def: ActionDef): ActionInfo {
    this.assertNotDestroyed();
    return this.registry.register(namespace, action, def);
  }

  unregister(namespace: string, action?: string): number {
    this.assertNotDestroyed();
    return this.registry.unregister(namespace, action);
  }

  getAction(namespace: string, action: string): ActionInfo | undefined {
    const entry = this.registry.get(namespace, action);
    return entry ? toInfo(entry) : undefined;
  }

  listActions(): ActionInfo[] {
    return this.registry.list().map(toInfo);
  }

  setBinds(namespace: string, action: string, binds: readonly (string | ComboInput)[]): KeyBind[] {
    this.assertNotDestroyed();
    const parsed = this.registry.setBinds(namespace, action, binds);
    this.bus.emit('bindsChanged', { namespace, action });
    return parsed;
  }

  reset(namespace: string, action: string): void {
    this.assertNotDestroyed();
    this.registry.reset(namespace, action);
    this.bus.emit('bindsChanged', { namespace, action });
  }

  resetAll(): void {
    this.assertNotDestroyed();
    this.registry.resetAll();
    for (const entry of this.registry.list()) {
      this.bus.emit('bindsChanged', {
        namespace: entry.namespace,
        action: entry.action,
      });
    }
  }

  conflicts(): HotkeyConflict[] {
    return this.registry.conflicts();
  }

  attach(target?: KeyboardTarget): void {
    this.assertNotDestroyed();
    this.engine.attach(target);
  }

  detach(): void {
    this.engine.detach();
  }

  get isAttached(): boolean {
    return this.engine.isAttached;
  }

  handle(event: MinimalKeyboardEvent, phase: 'down' | 'up' = 'down'): boolean {
    this.assertNotDestroyed();
    return this.engine.process(event, phase);
  }

  setActiveContexts(contexts: Iterable<string>): void {
    this.engine.setActiveContexts(contexts);
    this.bus.emit('contextsChanged', { active: this.engine.activeContextList() });
  }

  activateContext(context: string): void {
    this.setActiveContexts([...this.engine.activeContextList(), context]);
  }

  deactivateContext(context: string): void {
    this.setActiveContexts(this.engine.activeContextList().filter((name) => name !== context));
  }

  activeContexts(): string[] {
    return this.engine.activeContextList();
  }

  serialize(): HotkeyProfile {
    this.assertNotDestroyed();
    const overrides: Record<string, string[]> = {};
    for (const entry of this.registry.list()) {
      if (!entry.override) continue;
      const overrideIds = entry.override.map(comboId);
      const defaultIds = entry.defaults.map(comboId);
      if (sameSet(overrideIds, defaultIds)) continue;
      overrides[`${entry.namespace}/${entry.action}`] = overrideIds;
    }
    return { version: 1, overrides };
  }

  applyProfile(input: unknown): void {
    this.assertNotDestroyed();
    const result = v.safeParse(HotkeyProfileSchema, input);
    if (!result.success) {
      throw new InvalidProfileError('Invalid hotkey profile.', result.issues as readonly unknown[]);
    }

    const pending: { entry: RegisteredAction; binds: KeyBind[] }[] = [];
    for (const [key, combos] of Object.entries(result.output.overrides)) {
      const separator = key.indexOf('/');
      const namespace = separator > 0 ? key.slice(0, separator) : '';
      const action = separator > 0 ? key.slice(separator + 1) : '';
      if (!namespace || !action) {
        throw new InvalidProfileError(`Invalid profile key "${key}". Expected "namespace/action".`);
      }
      const entry = this.registry.get(namespace, action);
      if (!entry) {
        throw new InvalidProfileError(`Unknown hotkey action "${key}".`);
      }
      if (!entry.editable) {
        throw new InvalidProfileError(`Hotkey action "${key}" is not editable.`);
      }
      try {
        const binds = toKeyBinds(combos);
        pending.push({ entry, binds });
      } catch (cause) {
        throw new InvalidProfileError(`Invalid combo in profile entry "${key}".`, [], cause);
      }
    }

    for (const { entry, binds } of pending) {
      entry.override = binds;
      this.bus.emit('bindsChanged', { namespace: entry.namespace, action: entry.action });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.engine.detach();
    this.registry.clear();
    if (this.ownsBus) this.bus.destroy();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new HotkeysError('HotkeyManager has been destroyed.', 'DESTROYED');
    }
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

export function createHotkeyManager(options: HotkeyManagerOptions = {}): HotkeyManager {
  return new HotkeyManager(options);
}
