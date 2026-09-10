import * as v from 'valibot';
import { parseFormula } from '@openvtt/formula';
import { systemPackSchema } from './schema';
import { PackValidationError } from './errors';
import {
  buildConditionEdges,
  buildConditionNodes,
  topoConditionNodes,
  topoOrder,
} from './pipeline';
import type { SystemPack } from './types';

export function validatePack(pack: SystemPack): SystemPack {
  const issues: string[] = [];

  const parsed = v.safeParse(systemPackSchema, pack);
  if (!parsed.success) {
    for (const issue of parsed.issues) {
      issues.push(`schema: ${issue.path?.map((p) => p.key).join('.') ?? ''} ${issue.message}`);
    }
    throw new PackValidationError(issues);
  }

  const checkFormula = (source: string, where: string) => {
    try {
      parseFormula(source);
    } catch (err) {
      issues.push(`${where}: invalid formula "${source}" — ${(err as Error).message}`);
    }
  };

  const knownRefs = new Set((pack.definitions ?? []).map((def) => def.id));

  for (const [path, formula] of Object.entries(pack.derived ?? {})) {
    checkFormula(formula, `derived.${path}`);
  }

  for (const def of pack.definitions ?? []) {
    if (def.condition) checkFormula(def.condition, `definition.${def.id}.condition`);
    for (const change of def.changes) {
      if (
        change.kind === 'value' &&
        change.op !== 'upgrade' &&
        change.op !== 'downgrade' &&
        change.op !== 'append' &&
        change.op !== 'remove'
      ) {
        checkFormula(change.value, `definition.${def.id}.change(${change.path})`);
      }
      if (
        change.kind === 'value' &&
        (change.op === 'upgrade' || change.op === 'downgrade') &&
        !(change.value in (pack.ordinals ?? {}))
      ) {
        issues.push(`definition.${def.id}: unknown ordinal ladder "${change.value}"`);
      }
      if (change.kind === 'roll' && change.transform.bonus !== undefined) {
        checkFormula(change.transform.bonus, `definition.${def.id}.roll(${change.target}).bonus`);
      }
    }
    for (const grant of def.grants ?? []) {
      const ref = typeof grant === 'string' ? grant : grant.ref;
      if (!knownRefs.has(ref)) {
        issues.push(`definition.${def.id}: grants unknown effect "${ref}"`);
      }
      if (ref === def.id) {
        issues.push(`definition.${def.id}: grants itself`);
      }
    }
    for (const trigger of def.triggers ?? []) {
      if (trigger.condition) {
        checkFormula(trigger.condition, `definition.${def.id}.trigger(${trigger.on}).condition`);
      }
      if (trigger.effect !== undefined && !knownRefs.has(trigger.effect)) {
        issues.push(
          `definition.${def.id}: trigger(${trigger.on}) references unknown effect "${trigger.effect}"`,
        );
      }
      for (const change of trigger.changes ?? []) {
        if (
          change.kind === 'value' &&
          change.op !== 'upgrade' &&
          change.op !== 'downgrade' &&
          change.op !== 'append' &&
          change.op !== 'remove'
        ) {
          checkFormula(change.value, `definition.${def.id}.trigger(${trigger.on})`);
        }
      }
    }
  }

  const cycle = detectConditionCycle(pack);
  if (cycle) {
    issues.push(`condition dependency cycle between definitions: ${cycle.join(' -> ')}`);
  }

  try {
    topoOrder(pack.derived ?? {}, (source) => parseFormula(source));
  } catch (err) {
    issues.push((err as Error).message);
  }

  if (issues.length > 0) throw new PackValidationError(issues);
  return pack;
}

function detectConditionCycle(pack: SystemPack): readonly string[] | undefined {
  const conditioned = (pack.definitions ?? []).filter((def) => def.condition);
  if (conditioned.length === 0) return undefined;
  const order = conditioned.map((def) => def.id).sort();
  const nodes = buildConditionNodes(
    conditioned.map((def) => ({ id: def.id, condition: def.condition, changes: def.changes })),
    pack,
    (source) => parseFormula(source),
  );
  const edges = buildConditionEdges(nodes, order);
  const result = topoConditionNodes(order, edges);
  return 'cycle' in result ? result.cycle : undefined;
}

export function defineSystemPack(pack: SystemPack): SystemPack {
  return pack;
}
