import { v7 } from 'uuid';
import { DuplicateActionError, HotkeysError, InvalidComboError, NotEditableError, UnknownActionError } from './errors';
import { comboId, parseCombo } from './keys';
import type { ComboInput, MinimalKeyboardEvent } from './keys';
import type { KeyBind, Modifier } from './schema';

export interface HotkeyEventContext {
  readonly event: MinimalKeyboardEvent;
  readonly namespace: string;
  readonly action: string;
  readonly bind: KeyBind;
  readonly combo: string;
  readonly phase: 'down' | 'up';
  readonly repeat: boolean;
}

export type HotkeyHandler = (context: HotkeyEventContext) => boolean | void;

export interface ActionDef {
  name: string;
  hint?: string;
  binds?: readonly (string | ComboInput)[];
  onDown?: HotkeyHandler;
  onUp?: HotkeyHandler;
  repeat?: boolean;
  editable?: boolean;
  precedence?: number;
  context?: string;
  reservedModifiers?: readonly Modifier[];
  allowInInputs?: boolean;
}

export interface RegisteredAction {
  readonly namespace: string;
  readonly action: string;
  readonly name: string;
  readonly hint: string | undefined;
  readonly onDown: HotkeyHandler | undefined;
  readonly onUp: HotkeyHandler | undefined;
  readonly repeat: boolean;
  readonly editable: boolean;
  readonly precedence: number;
  readonly context: string;
  readonly reservedModifiers: readonly Modifier[];
  readonly allowInInputs: boolean;
  readonly order: number;
  readonly defaults: readonly KeyBind[];
  override: readonly KeyBind[] | undefined;
}

export interface ActionInfo {
  readonly namespace: string;
  readonly action: string;
  readonly name: string;
  readonly hint: string | undefined;
  readonly context: string;
  readonly editable: boolean;
  readonly repeat: boolean;
  readonly precedence: number;
  readonly reservedModifiers: readonly Modifier[];
  readonly allowInInputs: boolean;
  readonly binds: readonly KeyBind[];
  readonly defaults: readonly KeyBind[];
  readonly hasOverride: boolean;
}

export interface HotkeyConflict {
  readonly combo: string;
  readonly actions: readonly {
    readonly namespace: string;
    readonly action: string;
    readonly name: string;
    readonly context: string;
    readonly precedence: number;
    readonly editable: boolean;
  }[];
}

export const DEFAULT_CONTEXT = 'global';

export class ActionRegistry {
  private counter = 0;
  private readonly actions = new Map<string, Map<string, RegisteredAction>>();

  register(namespace: string, action: string, def: ActionDef): ActionInfo {
    validateIdentifier('namespace', namespace);
    validateIdentifier('action', action);
    let bucket = this.actions.get(namespace);
    if (!bucket) {
      bucket = new Map();
      this.actions.set(namespace, bucket);
    }
    if (bucket.has(action)) throw new DuplicateActionError(namespace, action);

    const entry: RegisteredAction = {
      namespace,
      action,
      name: def.name,
      hint: def.hint,
      onDown: def.onDown,
      onUp: def.onUp,
      repeat: def.repeat ?? false,
      editable: def.editable ?? true,
      precedence: def.precedence ?? 0,
      context: def.context ?? DEFAULT_CONTEXT,
      reservedModifiers: def.reservedModifiers ? [...def.reservedModifiers] : [],
      allowInInputs: def.allowInInputs ?? false,
      order: this.counter++,
      defaults: def.binds ? toKeyBinds(def.binds) : [],
      override: undefined,
    };
    bucket.set(action, entry);
    return toInfo(entry);
  }

  unregister(namespace: string, action?: string): number {
    if (action === undefined) {
      const bucket = this.actions.get(namespace);
      if (!bucket) return 0;
      this.actions.delete(namespace);
      return bucket.size;
    }
    const bucket = this.actions.get(namespace);
    if (!bucket || !bucket.delete(action)) return 0;
    if (bucket.size === 0) this.actions.delete(namespace);
    return 1;
  }

  get(namespace: string, action: string): RegisteredAction | undefined {
    return this.actions.get(namespace)?.get(action);
  }

  require(namespace: string, action: string): RegisteredAction {
    const entry = this.get(namespace, action);
    if (!entry) throw new UnknownActionError(namespace, action);
    return entry;
  }

  list(): RegisteredAction[] {
    const entries: RegisteredAction[] = [];
    for (const bucket of this.actions.values()) {
      for (const entry of bucket.values()) entries.push(entry);
    }
    return entries;
  }

  setBinds(namespace: string, action: string, binds: readonly (string | ComboInput)[]): KeyBind[] {
    const entry = this.require(namespace, action);
    if (!entry.editable) throw new NotEditableError(namespace, action);
    const parsed = toKeyBinds(binds);
    entry.override = parsed;
    return [...parsed];
  }

  reset(namespace: string, action: string): void {
    const entry = this.require(namespace, action);
    entry.override = undefined;
  }

  resetAll(): void {
    for (const entry of this.list()) entry.override = undefined;
  }

  effectiveBinds(entry: RegisteredAction): readonly KeyBind[] {
    return entry.override ?? entry.defaults;
  }

  conflicts(): HotkeyConflict[] {
    const byCombo = new Map<string, RegisteredAction[]>();
    for (const entry of this.list()) {
      for (const bind of this.effectiveBinds(entry)) {
        const id = comboId(bind);
        const group = byCombo.get(id) ?? [];
        group.push(entry);
        byCombo.set(id, group);
      }
    }
    const conflicts: HotkeyConflict[] = [];
    for (const [id, group] of byCombo) {
      const unique = dedupeActions(group);
      if (unique.length < 2) continue;
      conflicts.push({
        combo: id,
        actions: unique.map((entry) => ({
          namespace: entry.namespace,
          action: entry.action,
          name: entry.name,
          context: entry.context,
          precedence: entry.precedence,
          editable: entry.editable,
        })),
      });
    }
    return conflicts.sort((a, b) => a.combo.localeCompare(b.combo));
  }

  clear(): void {
    this.actions.clear();
  }
}

export function toKeyBinds(binds: readonly (string | ComboInput)[]): KeyBind[] {
  if (!Array.isArray(binds)) throw new InvalidComboError(binds, 'binds must be an array');
  return binds.map((input) => {
    const combo = parseCombo(input);
    return { id: v7(), key: combo.key, modifiers: combo.modifiers };
  });
}

export function toInfo(entry: RegisteredAction): ActionInfo {
  return {
    namespace: entry.namespace,
    action: entry.action,
    name: entry.name,
    hint: entry.hint,
    context: entry.context,
    editable: entry.editable,
    repeat: entry.repeat,
    precedence: entry.precedence,
    reservedModifiers: entry.reservedModifiers,
    allowInInputs: entry.allowInInputs,
    binds: [...(entry.override ?? entry.defaults)],
    defaults: [...entry.defaults],
    hasOverride: entry.override !== undefined,
  };
}

function dedupeActions(group: RegisteredAction[]): RegisteredAction[] {
  const seen = new Set<string>();
  const unique: RegisteredAction[] = [];
  for (const entry of group) {
    const key = `${entry.namespace} ${entry.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function validateIdentifier(label: string, value: string): void {
  if (!value || value.includes('/')) {
    throw new HotkeysError(`Invalid hotkey ${label} "${value}": it must be non-empty and cannot contain "/".`);
  }
}
