export interface DieResult {
  type: string;
  sides: number;
  id: number;
  value: number;
  label: string | number;
  reason: string;
  [key: string]: unknown;
}

export interface RollSetResult {
  num: number;
  type: string;
  sides: number;
  rolls: DieResult[];
  total: number;
  [key: string]: unknown;
}

export interface RollResult {
  id: string;
  notation: string;
  sets: RollSetResult[];
  modifier: number;
  total: number;
  [key: string]: unknown;
}
