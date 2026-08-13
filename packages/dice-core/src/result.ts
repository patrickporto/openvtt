export type DieOutcome = 'success' | 'failure' | 'neutral';

export interface DieRoll {
  readonly value: number;
  readonly kept: boolean;
  readonly exploded: boolean;
  readonly rerolled: boolean;
  readonly penetrated: boolean;
  readonly outcome: DieOutcome;
  readonly history: readonly number[];
}

export interface TermResult {
  readonly id: string;
  readonly type: 'die' | 'pool';
  readonly value: number;
  readonly dice: readonly DieRoll[];
  readonly applied: readonly string[];
  readonly children?: readonly TermResult[];
}

export interface RollResult {
  readonly id: string;
  readonly value: number | boolean;
  readonly terms: readonly TermResult[];
  readonly rolls: readonly DieRoll[];
}

export function makeDieRoll(value: number, extra: Partial<DieRoll> = {}): DieRoll {
  return {
    value,
    kept: extra.kept ?? true,
    exploded: extra.exploded ?? false,
    rerolled: extra.rerolled ?? false,
    penetrated: extra.penetrated ?? false,
    outcome: extra.outcome ?? 'neutral',
    history: extra.history ?? [value],
  };
}

export interface WorkingDie {
  value: number;
  kept: boolean;
  exploded: boolean;
  rerolled: boolean;
  penetrated: boolean;
  outcome: DieOutcome;
  history: number[];
}

export function toDieRoll(d: WorkingDie): DieRoll {
  return {
    value: d.value,
    kept: d.kept,
    exploded: d.exploded,
    rerolled: d.rerolled,
    penetrated: d.penetrated,
    outcome: d.outcome,
    history: [...d.history],
  };
}

export function freeze(dice: readonly WorkingDie[]): readonly DieRoll[] {
  return dice.map(toDieRoll);
}
