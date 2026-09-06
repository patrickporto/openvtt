/**
 * Parser da matemática inline dos trackers (semântica Owl Trackers):
 * `-7` subtrai, `+7` adiciona, `=-7` define, `7` define. Ainda que o tracker
 * desative matemática (`math: false`), o input numérico simples continua
 * definindo o valor — a distinção é política do chamador.
 */

export type MathOperation = 'set' | 'add' | 'subtract';

export interface MathExpression {
  readonly op: MathOperation;
  readonly operand: number;
}

export type MathParseError = 'empty' | 'invalid-number' | 'malformed';

export type MathParseResult =
  | { readonly ok: true; readonly expression: MathExpression }
  | { readonly ok: false; readonly error: MathParseError };

const UNSIGNED_NUMBER = /^\d+(?:\.\d+)?$/;
const SIGNED_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

/** Classifica o resto após o operador: null = número válido. */
function classifyRest(rest: string, allowLeadingSign: boolean): MathParseError | null {
  if (rest.length === 0) return 'malformed';
  const body = allowLeadingSign && /^[+-]/.test(rest) ? rest.slice(1) : rest;
  if (body.length === 0) return 'malformed';
  if (body.includes('+') || body.includes('-')) return 'malformed';
  return UNSIGNED_NUMBER.test(body) ? null : 'invalid-number';
}

export function parseMathInput(input: string): MathParseResult {
  const text = input.trim();
  if (text.length === 0) return { ok: false, error: 'empty' };

  let op: MathOperation = 'set';
  let rest = text;

  if (text.startsWith('=')) {
    op = 'set';
    rest = text.slice(1);
  } else if (text.startsWith('+')) {
    op = 'add';
    rest = text.slice(1);
  } else if (text.startsWith('-')) {
    op = 'subtract';
    rest = text.slice(1);
  }

  const error = classifyRest(rest, op === 'set');
  if (error) return { ok: false, error };

  const operand = Number(rest);
  if (!Number.isFinite(operand)) return { ok: false, error: 'invalid-number' };

  return { ok: true, expression: { op, operand } };
}

export function applyMath(current: number, expression: MathExpression): number {
  switch (expression.op) {
    case 'add':
      return current + expression.operand;
    case 'subtract':
      return current - expression.operand;
    case 'set':
      return expression.operand;
  }
}

/** Formata a expressão de volta para a sintaxe de entrada (feedback de UI). */
export function formatMath(expression: MathExpression): string {
  const sign = expression.op === 'add' ? '+' : expression.op === 'subtract' ? '-' : '=';
  return `${sign}${expression.operand}`;
}
