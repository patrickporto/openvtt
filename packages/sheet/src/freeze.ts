export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value) || Object.isFrozen(value)) return value;
  seen.add(value);
  if (value instanceof Map) {
    for (const entry of value.values()) deepFreeze(entry, seen);
  } else if (value instanceof Set) {
    for (const entry of value.values()) deepFreeze(entry, seen);
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key], seen);
    }
  }
  Object.freeze(value);
  return value;
}
