import type { RollExpr } from '@openvtt/dice-core';
import { fromFormula as parseFormula } from '@openvtt/dice-notation-core';
import { dialect } from './dialect';

export function fromFormula(source: string): RollExpr {
  return parseFormula(dialect, source);
}
