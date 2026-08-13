import { isDiceExpr } from '@openvtt/dice-core';
import type { DiceExpr, DieTerm, Pool, RollExpr } from '@openvtt/dice-core';
import { parseFormula } from '@openvtt/formula';
import type { RollTransform } from './types';

export function applyRollTransform(expr: RollExpr, transform: RollTransform): RollExpr {
  let out = expr;

  if (transform.addDice !== undefined || (transform.addModifiers?.length ?? 0) > 0) {
    out = mapDice(out, (dice) => {
      if (dice.type === 'die') {
        const count =
          transform.addDice !== undefined ? bumpCount(dice.count, transform.addDice) : dice.count;
        const modifiers = [
          ...(dice.modifiers ?? []),
          ...(transform.addModifiers ?? []),
        ];
        return { ...dice, count, ...(modifiers.length > 0 ? { modifiers } : {}) };
      }
      const modifiers = [
        ...(dice.modifiers ?? []),
        ...(transform.addModifiers ?? []),
      ];
      return modifiers.length > 0 ? { ...dice, modifiers } : dice;
    });
  }

  for (const extra of transform.extraDice ?? []) {
    const term: DieTerm = {
      type: 'die',
      count: extra.count,
      faces: { kind: 'number', value: extra.faces },
      ...(extra.modifiers ? { modifiers: extra.modifiers } : {}),
    };
    out = { '+': [out, term] };
  }

  if (transform.bonus !== undefined) {
    out = { '+': [out, parseFormula(transform.bonus) as RollExpr] };
  }

  return out;
}

function bumpCount(count: RollExpr, delta: number): RollExpr {
  if (typeof count === 'number') return count + delta;
  return { '+': [count, delta] };
}

function mapDice(expr: RollExpr, fn: (dice: DiceExpr) => DiceExpr): RollExpr {
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (isDiceExpr(expr)) {
    const mapped = fn(expr);
    if (mapped.type === 'pool') {
      return {
        ...mapped,
        entries: mapped.entries.map((entry) => mapDice(entry, fn)),
      } as Pool;
    }
    return mapped;
  }
  if ('var' in expr) return expr;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(expr as Record<string, unknown>)) {
    out[key] = Array.isArray(value)
      ? value.map((child) => mapDice(child as RollExpr, fn))
      : value;
  }
  return out as RollExpr;
}
