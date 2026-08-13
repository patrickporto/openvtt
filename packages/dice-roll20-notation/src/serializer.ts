import type { RollExpr } from '@openvtt/dice-core';
import { toFormula as printFormula } from '@openvtt/dice-notation-core';
import { dialect } from './dialect';

export function toFormula(expr: RollExpr): string {
  return printFormula(dialect, expr);
}
