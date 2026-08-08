export type Scope = Record<string, unknown> | undefined;

export function resolvePath(scope: Scope, path: string): unknown {
  if (scope == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(scope, path)) {
    return (scope as Record<string, unknown>)[path];
  }
  const segments = path.split('.');
  let current: unknown = scope;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true;
}
