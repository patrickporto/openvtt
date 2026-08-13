export type Constructor<T, A extends unknown[] = unknown[]> = new (...args: A) => T;
