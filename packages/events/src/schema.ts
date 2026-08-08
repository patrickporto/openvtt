import * as v from 'valibot';
import { EventValidationError } from './errors';

export type Schema = v.GenericSchema | undefined;

export type SchemaOutput<S> = S extends v.GenericSchema<any, infer O, any> ? O : unknown;

export type ValidationMode = 'throw' | 'warn' | 'off';

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export interface ValidationFail {
  ok: false;
  value: unknown;
  issues: readonly unknown[];
}

export type ValidationResult<T> = ValidationOk<T> | ValidationFail;

export function isSchema(value: unknown): value is v.GenericSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string' &&
    '~validate' in value
  );
}

export function validatePayload(
  schema: Schema,
  value: unknown,
  mode: ValidationMode,
  label: string,
): ValidationResult<unknown> {
  if (!schema || mode === 'off') return { ok: true, value };

  const result = v.safeParse(schema, value);
  if (result.success) return { ok: true, value: result.output };

  const issues = result.issues as readonly unknown[];

  if (mode === 'throw') {
    const summary = formatIssues(issues);
    throw new EventValidationError(`Validation failed for "${label}":\n${summary}`, issues);
  }

  console.warn(`[@openvtt/events] Validation warning for "${label}":\n${formatIssues(issues)}`);
  return { ok: false, value, issues };
}

export function formatIssues(issues: readonly unknown[]): string {
  return issues
    .map((issue) => {
      const path = readPath(issue);
      const message = readMessage(issue);
      return path ? `  at ${path}: ${message}` : `  - ${message}`;
    })
    .join('\n');
}

function readPath(issue: unknown): string {
  if (issue && typeof issue === 'object' && 'path' in issue) {
    const path = (issue as { path?: unknown }).path;
    if (Array.isArray(path) && path.length > 0) {
      return path
        .map((seg) =>
          seg && typeof seg === 'object' && 'key' in seg ? String((seg as { key: unknown }).key) : String(seg),
        )
        .join('.');
    }
  }
  return '';
}

function readMessage(issue: unknown): string {
  if (issue && typeof issue === 'object' && 'message' in issue) {
    return String((issue as { message: unknown }).message);
  }
  return 'invalid value';
}
