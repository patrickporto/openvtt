export function getPath(root: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = root;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const next = current[segment];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]!] = value;
}

export function flatten(root: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (root == null || typeof root !== 'object' || Array.isArray(root)) {
    if (prefix) out[prefix] = root;
    return out;
  }
  for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function diffFlattened(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): readonly { path: string; previous: unknown; next: unknown }[] {
  const patches: { path: string; previous: unknown; next: unknown }[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const before = previous[key];
    const after = next[key];
    if (!Object.is(before, after)) {
      patches.push({ path: key, previous: before, next: after });
    }
  }
  return patches.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
