import { v7 } from 'uuid';
import * as v from 'valibot';
import { evaluateFormula, isTruthy, parseFormula, toNumber } from '@openvtt/formula';
import type { FormulaExpr } from '@openvtt/formula';
import { evaluateRoll } from '@openvtt/dice-core';
import type { RollExpr } from '@openvtt/dice-core';
import { fromFormula } from '@openvtt/dice-notation';
import { characterDocumentSchema, effectDefinitionSchema } from './schema';
import { computeSheet } from './pipeline';
import { applyRollTransform } from './roll-transform';
import { diffFlattened, flatten, getPath, setPath } from './paths';
import { UnknownEffectError, UnknownOrdinalError, UnknownTemplateError } from './errors';
import { validatePack } from './validate';
import type { SheetBus } from './bus';
import type { ResolvedEffect } from './internal-types';
import type {
  CharacterDocument,
  Change,
  ComputedSheet,
  DurationSpec,
  EffectDefinition,
  EffectInstance,
  EffectSource,
  ExpirationState,
  SheetPatch,
  SystemPack,
  ValueChange,
} from './types';

export type RollFn = (expr: RollExpr, scope: Record<string, unknown>) => number;

export interface DurationEventNames {
  readonly rounds: string;
  readonly turns: string;
}

export interface SheetEngineOptions {
  readonly pack: SystemPack;
  readonly bus?: SheetBus;
  readonly id?: () => string;
  readonly durationEvents?: Partial<DurationEventNames>;
  readonly roller?: RollFn;
  readonly validate?: boolean;
  readonly clockEvent?: string | false;
}

export interface ApplyEffectOptions {
  readonly source?: EffectSource;
  readonly data?: Record<string, unknown>;
  readonly expiresAt?: ExpirationState;
  readonly enabled?: boolean;
  readonly id?: string;
}

export function createDocument(
  pack: SystemPack,
  init: {
    identity?: Record<string, unknown>;
    base?: Record<string, unknown>;
    effects?: EffectInstance[];
  } = {},
): CharacterDocument {
  return {
    systemId: pack.id,
    systemVersion: pack.version,
    identity: init.identity ?? {},
    base: init.base ?? {},
    effects: init.effects ?? [],
  };
}

const defaultRoller: RollFn = (expr, scope) => toNumber(evaluateRoll(expr, { scope }).value);

const FORMULA_CACHE_LIMIT = 512;

export class SheetEngine {
  readonly pack: SystemPack;
  private readonly bus?: SheetBus;
  private readonly nextId: () => string;
  private readonly roller: RollFn;
  private readonly durationEvents: DurationEventNames;
  private readonly definitions = new Map<string, EffectDefinition>();
  private readonly formulaCache = new Map<string, FormulaExpr>();
  private detachBus?: () => void;

  private documentData: CharacterDocument;
  private cached: ComputedSheet | undefined;
  private lastSnapshot: Record<string, unknown> = {};
  private handling = false;
  private readonly pendingEvents: Array<{ name: string; payload: unknown }> = [];
  private readonly clockEvent: string | false;

  constructor(document: CharacterDocument, options: SheetEngineOptions) {
    this.pack = options.validate === false ? options.pack : validatePack(options.pack);
    this.bus = options.bus;
    this.nextId = options.id ?? (() => v7());
    this.roller = options.roller ?? defaultRoller;
    this.durationEvents = {
      rounds: options.durationEvents?.rounds ?? 'round:end',
      turns: options.durationEvents?.turns ?? 'turn:end',
    };
    this.clockEvent = options.clockEvent === undefined ? 'clock:tick' : options.clockEvent;
    this.documentData = document;

    for (const def of this.pack.definitions ?? []) {
      this.definitions.set(def.id, def);
    }

    this.lastSnapshot = flatten(this.compute().scope);
  }

  get document(): CharacterDocument {
    return this.snapshot();
  }

  snapshot(): CharacterDocument {
    return structuredClone(this.documentData);
  }

  attach(): () => void {
    if (!this.bus) return () => {};
    if (this.detachBus) return this.detachBus;
    const detach = this.bus.onAny((name: string, payload: unknown) => {
      this.notifyEvent(name, payload);
    });
    this.detachBus = () => {
      this.detachBus = undefined;
      detach();
    };
    return this.detachBus;
  }

  destroy(): void {
    this.detachBus?.();
  }

  registerDefinition(definition: EffectDefinition): EffectDefinition {
    const parsed = v.parse(effectDefinitionSchema, definition) as EffectDefinition;
    this.definitions.set(parsed.id, parsed);
    this.markDirty();
    return parsed;
  }

  getDefinition(ref: string): EffectDefinition | undefined {
    return this.definitions.get(ref);
  }

  compute(): ComputedSheet {
    if (!this.cached) {
      const entries = this.resolveAll();
      this.cached = computeSheet(this.documentData.base, entries, this.pack, (s) => this.parse(s));
    }
    return this.cached;
  }

  applyEffect(refOrDef: string | EffectDefinition, options: ApplyEffectOptions = {}): EffectInstance {
    const definition =
      typeof refOrDef === 'string' ? this.requireDefinition(refOrDef) : refOrDef;
    const instance: EffectInstance = {
      id: options.id ?? this.nextId(),
      ...(typeof refOrDef === 'string' ? { ref: refOrDef } : { inline: definition }),
      source: options.source ?? { kind: 'manual' },
      enabled: options.enabled ?? true,
      ...(options.expiresAt ?? definition.duration
        ? { expiresAt: options.expiresAt ?? durationToExpiration(definition.duration!) }
        : {}),
      ...(options.data ? { data: options.data } : {}),
    };
    this.documentData.effects.push(instance);
    this.emitInstance('effect:applied', instance);
    this.spawnGrants(instance, definition, new Set([definition.id]));
    this.afterMutation();
    return instance;
  }

  private spawnGrants(
    parent: EffectInstance,
    definition: EffectDefinition,
    seen: Set<string>,
  ): void {
    for (const grant of definition.grants ?? []) {
      const ref = typeof grant === 'string' ? grant : grant.ref;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const granted = this.requireDefinition(ref);
      const child: EffectInstance = {
        id: this.nextId(),
        ref,
        source: { kind: 'grant', id: parent.id },
        enabled: true,
        ...(granted.duration ? { expiresAt: durationToExpiration(granted.duration) } : {}),
        ...(typeof grant === 'object' && grant.data ? { data: grant.data } : {}),
      };
      this.documentData.effects.push(child);
      this.emitInstance('effect:applied', child);
      this.spawnGrants(child, granted, seen);
    }
  }

  removeEffect(id: string): boolean {
    if (!this.documentData.effects.some((e) => e.id === id)) return false;
    const ids = this.collectWithGrants([id]);
    const removed: EffectInstance[] = [];
    const effects = this.documentData.effects;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (ids.has(effects[i]!.id)) {
        const [instance] = effects.splice(i, 1);
        removed.unshift(instance!);
      }
    }
    for (const instance of removed) this.emitInstance('effect:removed', instance);
    this.afterMutation();
    return true;
  }

  removeBySource(source: EffectSource): EffectInstance[] {
    const seeds: string[] = [];
    for (const instance of this.documentData.effects) {
      const match =
        instance.source.kind === source.kind &&
        (source.id === undefined || instance.source.id === source.id);
      if (match) seeds.push(instance.id);
    }
    if (seeds.length === 0) return [];
    const ids = this.collectWithGrants(seeds);
    const removed: EffectInstance[] = [];
    const effects = this.documentData.effects;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (ids.has(effects[i]!.id)) {
        const [instance] = effects.splice(i, 1);
        removed.unshift(instance!);
      }
    }
    for (const instance of removed) this.emitInstance('effect:removed', instance);
    this.afterMutation();
    return removed;
  }

  private collectWithGrants(seedIds: readonly string[]): Set<string> {
    const ids = new Set(seedIds);
    let grew = true;
    while (grew) {
      grew = false;
      for (const instance of this.documentData.effects) {
        if (
          instance.source.kind === 'grant' &&
          instance.source.id !== undefined &&
          ids.has(instance.source.id) &&
          !ids.has(instance.id)
        ) {
          ids.add(instance.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const instance = this.documentData.effects.find((e) => e.id === id);
    if (!instance || instance.enabled === enabled) return false;
    instance.enabled = enabled;
    this.afterMutation(enabled ? 'effect:enabled' : 'effect:disabled', instance);
    return true;
  }

  buildRoll(templateId: string): RollExpr {
    const template = this.pack.rollTemplates?.[templateId];
    if (!template) throw new UnknownTemplateError(templateId);
    let expr = template.expr;
    for (const active of this.compute().rollTransforms) {
      if (!matchesTarget(active.target, templateId, template.tags ?? [])) continue;
      expr = applyRollTransform(expr, active.transform);
    }
    return expr;
  }

  notifyEvent(name: string, payload: unknown = {}): void {
    if (this.handling) {
      this.pendingEvents.push({ name, payload });
      return;
    }
    this.handling = true;
    try {
      this.handleEvent(name, payload);
      for (
        let queued = this.pendingEvents.shift();
        queued !== undefined;
        queued = this.pendingEvents.shift()
      ) {
        this.handleEvent(queued.name, queued.payload);
      }
    } finally {
      this.handling = false;
    }
  }

  private handleEvent(name: string, payload: unknown): void {
    if (this.clockEvent !== false && name === this.clockEvent) {
      const elapsed = extractElapsed(payload);
      if (elapsed > 0) this.tickSecondsInternal(elapsed);
    }
    this.fireTriggers(name, payload);
    this.processDurations(name);
    this.emitComputed();
  }

  tickSeconds(seconds: number): void {
    if (this.tickSecondsInternal(seconds)) this.afterMutation();
  }

  loadDocument(json: unknown): CharacterDocument {
    this.documentData = v.parse(characterDocumentSchema, json) as CharacterDocument;
    this.markDirty();
    this.emitComputed();
    return this.snapshot();
  }

  refresh(): void {
    this.afterMutation();
  }

  private fireTriggers(name: string, payload: unknown): void {
    const computed = this.compute();
    for (const instance of computed.effects) {
      const definition = this.resolveDef(instance);
      for (const trigger of definition.triggers ?? []) {
        if (trigger.on !== name) continue;
        const scope = { ...computed.scope, data: instance.data ?? {}, event: payload };
        if (
          trigger.condition &&
          !isTruthy(evaluateFormula(this.parse(trigger.condition), { scope }))
        ) {
          continue;
        }
        for (const change of trigger.changes ?? []) {
          this.applyTriggerChange(instance, change, scope);
        }
        if (trigger.effect !== undefined) {
          this.applyEffect(trigger.effect, { source: { kind: 'trigger', id: instance.id } });
        }
        if (trigger.roll !== undefined) {
          const expr =
            typeof trigger.roll === 'string' ? fromFormula(trigger.roll) : trigger.roll;
          const value = this.roller(expr, scope);
          if (trigger.rollInto) {
            const current = toNumber(getPath(this.documentData.base, trigger.rollInto.path));
            const op = trigger.rollInto.op ?? 'subtract';
            const next =
              op === 'add' ? current + value : op === 'set' ? value : current - value;
            setPath(this.documentData.base, trigger.rollInto.path, next);
            this.markDirty();
          }
          this.bus?.emit('trigger:roll', { instanceId: instance.id, on: name, value });
        }
        this.bus?.emit('trigger:fired', { instanceId: instance.id, on: name });
      }
    }
  }

  private applyTriggerChange(
    instance: EffectInstance,
    change: Change,
    scope: Record<string, unknown>,
  ): void {
    const base = this.documentData.base;
    if (change.kind === 'flag') {
      setPath(base, change.path, change.value);
      this.markDirty();
      return;
    }
    if (change.kind !== 'value') return;
    this.applyValueChange(base, instance, change, scope);
    this.markDirty();
  }

  private applyValueChange(
    target: Record<string, unknown>,
    instance: EffectInstance,
    change: ValueChange,
    scope: Record<string, unknown>,
  ): void {
    if (change.op === 'upgrade' || change.op === 'downgrade') {
      const ladder = this.pack.ordinals?.[change.value];
      if (!ladder) throw new UnknownOrdinalError(change.value);
      const current = getPath(target, change.path);
      const index = ladder.indexOf(String(current));
      const steps = change.steps ?? 1;
      const delta = change.op === 'upgrade' ? steps : -steps;
      const next = Math.min(Math.max((index < 0 ? 0 : index) + delta, 0), ladder.length - 1);
      setPath(target, change.path, ladder[next]!);
      return;
    }
    const input = evaluateFormula(this.parse(change.value), {
      scope: { ...scope, data: instance.data ?? {} },
    });
    const current = getPath(target, change.path);
    if (change.op === 'set') setPath(target, change.path, input);
    else if (change.op === 'add') setPath(target, change.path, toNumber(current) + toNumber(input));
    else setPath(target, change.path, toNumber(current) * toNumber(input));
  }

  private tickSecondsInternal(seconds: number): boolean {
    let changed = false;
    for (const instance of [...this.documentData.effects]) {
      const exp = instance.expiresAt;
      if (!exp || exp.unit !== 'seconds') continue;
      const remaining = (exp.remaining ?? 0) - seconds;
      if (remaining <= 0) {
        this.expireInstance(instance);
        changed = true;
      } else {
        instance.expiresAt = { ...exp, remaining };
      }
    }
    return changed;
  }

  private processDurations(name: string): void {
    let changed = false;
    for (const instance of [...this.documentData.effects]) {
      const exp = instance.expiresAt;
      if (!exp) continue;
      if (exp.unit === 'until-event') {
        if (exp.event === name) {
          this.expireInstance(instance);
          changed = true;
        }
        continue;
      }
      const tick =
        (exp.unit === 'rounds' && name === this.durationEvents.rounds) ||
        (exp.unit === 'turns' && name === this.durationEvents.turns);
      if (!tick) continue;
      const remaining = (exp.remaining ?? 1) - 1;
      if (remaining <= 0) {
        this.expireInstance(instance);
        changed = true;
      } else {
        instance.expiresAt = { ...exp, remaining };
      }
    }
    if (changed) this.afterMutation();
  }

  private expireInstance(instance: EffectInstance): void {
    const ids = this.collectWithGrants([instance.id]);
    const effects = this.documentData.effects;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (ids.has(effects[i]!.id)) {
        const [removed] = effects.splice(i, 1);
        this.emitInstance('effect:expired', removed!);
      }
    }
    this.markDirty();
  }

  private afterMutation(event?: 'effect:applied' | 'effect:removed' | 'effect:enabled' | 'effect:disabled', instance?: EffectInstance): void {
    if (event && instance) this.emitInstance(event, instance);
    this.markDirty();
    this.emitComputed();
  }

  private emitComputed(): void {
    const scope = this.compute().scope;
    const snapshot = flatten(scope);
    const patches: readonly SheetPatch[] = diffFlattened(this.lastSnapshot, snapshot);
    this.lastSnapshot = snapshot;
    if (patches.length > 0) {
      this.bus?.emit('computed', { patches: [...patches] });
    }
  }

  private emitInstance(
    event: 'effect:applied' | 'effect:removed' | 'effect:expired' | 'effect:enabled' | 'effect:disabled',
    instance: EffectInstance,
  ): void {
    this.bus?.emit(event, { instanceId: instance.id, ref: instance.ref ?? instance.inline?.id });
  }

  private markDirty(): void {
    this.cached = undefined;
  }

  private resolveAll(): ResolvedEffect[] {
    const entries: ResolvedEffect[] = [];
    for (const instance of this.documentData.effects) {
      entries.push({ instance, definition: this.resolveDef(instance) });
    }
    return entries;
  }

  private resolveDef(instance: EffectInstance): EffectDefinition {
    if (instance.inline) return instance.inline;
    return this.requireDefinition(instance.ref!);
  }

  private requireDefinition(ref: string): EffectDefinition {
    const definition = this.definitions.get(ref);
    if (!definition) throw new UnknownEffectError(ref);
    return definition;
  }

  private parse(source: string): FormulaExpr {
    const cached = this.formulaCache.get(source);
    if (cached) return cached;
    const expr = parseFormula(source) as FormulaExpr;
    if (this.formulaCache.size >= FORMULA_CACHE_LIMIT) {
      const oldest = this.formulaCache.keys().next().value;
      if (oldest !== undefined) this.formulaCache.delete(oldest);
    }
    this.formulaCache.set(source, expr);
    return expr;
  }
}

function durationToExpiration(duration: DurationSpec): ExpirationState {
  return {
    unit: duration.unit,
    ...(duration.value !== undefined ? { remaining: duration.value } : {}),
    ...(duration.event !== undefined ? { event: duration.event } : {}),
  };
}

function matchesTarget(target: string, templateId: string, tags: readonly string[]): boolean {
  if (target === '*') return true;
  if (target.endsWith('*')) {
    const prefix = target.slice(0, -1);
    return templateId.startsWith(prefix) || tags.some((tag) => tag.startsWith(prefix));
  }
  return templateId === target || tags.includes(target);
}

function extractElapsed(payload: unknown): number {
  if (typeof payload === 'number') return payload;
  if (payload != null && typeof payload === 'object') {
    const elapsed = (payload as Record<string, unknown>).elapsed;
    if (typeof elapsed === 'number') return elapsed;
  }
  return 0;
}
