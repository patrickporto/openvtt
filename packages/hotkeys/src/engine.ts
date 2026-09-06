import type { EventBus } from '@openvtt/events';
import type { HotkeyEventMap, HotkeyHookMap } from './schema';
import type { KeyBind } from './schema';
import type { ActionRegistry, HotkeyEventContext, RegisteredAction } from './registry';
import { comboId, keyFromEvent, matchesBind } from './keys';
import type { MinimalKeyboardEvent } from './keys';
import { NotAttachedError } from './errors';

export interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void): unknown;
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void): unknown;
}

export interface EngineOptions {
  skipInputs?: boolean;
  autoPreventDefault?: boolean;
  debug?: boolean | ((...args: unknown[]) => void);
}

type DebugLogger = (...args: unknown[]) => void;

export class KeyEngine {
  private readonly registry: ActionRegistry;
  private readonly bus: EventBus<HotkeyEventMap, HotkeyHookMap>;
  private readonly skipInputs: boolean;
  private readonly autoPreventDefault: boolean;
  private readonly debug: DebugLogger | undefined;
  private target: KeyboardTarget | undefined;
  private readonly keydown = (event: KeyboardEvent) => {
    this.process(event, 'down');
  };
  private readonly keyup = (event: KeyboardEvent) => {
    this.process(event, 'up');
  };
  private activeContexts = new Set<string>();

  constructor(
    registry: ActionRegistry,
    bus: EventBus<HotkeyEventMap, HotkeyHookMap>,
    options: EngineOptions = {},
  ) {
    this.registry = registry;
    this.bus = bus;
    this.skipInputs = options.skipInputs ?? true;
    this.autoPreventDefault = options.autoPreventDefault ?? true;
    this.debug = resolveDebug(options.debug);
  }

  attach(target?: KeyboardTarget): void {
    if (this.target) this.detach();
    const resolved = target ?? (typeof window !== 'undefined' ? window : undefined);
    if (!resolved) {
      throw new NotAttachedError('No keyboard target available. Pass a Window or Document explicitly.');
    }
    this.target = resolved;
    resolved.addEventListener('keydown', this.keydown);
    resolved.addEventListener('keyup', this.keyup);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.keydown);
    this.target.removeEventListener('keyup', this.keyup);
    this.target = undefined;
  }

  get isAttached(): boolean {
    return this.target !== undefined;
  }

  setActiveContexts(contexts: Iterable<string>): Set<string> {
    const next = new Set(contexts);
    this.activeContexts = next;
    return new Set(next);
  }

  activeContextList(): string[] {
    return [...this.activeContexts];
  }

  isActiveContext(context: string): boolean {
    return context === 'global' || this.activeContexts.has(context);
  }

  process(event: MinimalKeyboardEvent, phase: 'down' | 'up'): boolean {
    const key = keyFromEvent(event);
    if (!key) return false;
    const inInput = this.skipInputs && isEditableTarget(event.target);
    const repeat = event.repeat === true;

    const matched: { entry: RegisteredAction; bind: KeyBind }[] = [];
    const entries = this.registry.list();
    for (const entry of entries) {
      if (phase === 'down' && !entry.onDown) continue;
      if (phase === 'up' && !entry.onUp) continue;
      if (repeat && phase === 'down' && !entry.repeat) continue;
      if (inInput && !entry.allowInInputs) continue;
      if (!this.isActiveContext(entry.context)) continue;
      const binds = this.registry.effectiveBinds(entry);
      const bind = binds.find((candidate) => matchesBind(candidate, event, entry.reservedModifiers));
      if (bind) matched.push({ entry, bind });
    }

    matched.sort(
      (a, b) => b.entry.precedence - a.entry.precedence || a.entry.order - b.entry.order,
    );

    let handled = false;
    for (const { entry, bind } of matched) {
      const combo = comboId(bind);
      if (this.vetoed(entry, combo, phase)) continue;
      const context: HotkeyEventContext = {
        event,
        namespace: entry.namespace,
        action: entry.action,
        bind,
        combo,
        phase,
        repeat,
      };
      const handler = phase === 'down' ? entry.onDown : entry.onUp;
      let result: boolean | void;
      try {
        result = handler?.(context);
      } catch (error) {
        this.reportHandlerError(entry, combo, error);
        continue;
      }
      this.bus.emit('hotkeyTriggered', {
        namespace: entry.namespace,
        action: entry.action,
        combo,
        phase,
        repeat,
      });
      if (result === true) {
        handled = true;
        if (this.autoPreventDefault) {
          event.preventDefault?.();
          event.stopPropagation?.();
        }
        break;
      }
    }

    if (this.debug) {
      this.debug(
        '[hotkeys]',
        phase,
        key,
        `matched=${matched.length}`,
        `handled=${handled}`,
      );
    }
    return handled;
  }

  private vetoed(entry: RegisteredAction, combo: string, phase: 'down' | 'up'): boolean {
    try {
      const result = this.bus.call('beforeHotkey', {
        namespace: entry.namespace,
        action: entry.action,
        combo,
        phase,
        veto: false,
      });
      return result.veto === true;
    } catch (error) {
      this.debug?.('[hotkeys] beforeHotkey hook failed', error);
      return false;
    }
  }

  private reportHandlerError(entry: RegisteredAction, combo: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.bus.emit('hotkeyError', {
      namespace: entry.namespace,
      action: entry.action,
      combo,
      message,
    });
  }
}

export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return element.isContentEditable === true;
}

function resolveDebug(debug: EngineOptions['debug']): DebugLogger | undefined {
  if (!debug) return undefined;
  if (debug === true) return (...args: unknown[]) => console.debug(...args);
  return debug;
}
