import { fromFormula } from '@openvtt/dice-notation';
import type { FacesSpec, RollExpr } from '@openvtt/dice-core';

import type { DiceSetStyle, ThrowVector } from './dice-mesh';

export interface DiceSet {
  num: number;
  type: string;
  sid: number;
  gid: number;
  glvl: number;
  func?: string;
  args?: string | string[];
  op?: string;
  style?: DiceSetStyle;
}

export interface NotationObject {
  notation: string;
  constant?: number | null;
  op?: string;
  boost?: number;
  result?: string[];
  error?: boolean;
  vectors?: ThrowVector[];
  set: DiceSet[];
}

export interface ParsedNotation {
  notation: string;
  constant: number | null;
  op: string;
  boost: number;
  result: string[];
  error: boolean;
  vectors: ThrowVector[];
  set: DiceSet[];
}

export interface NotationParser {
  parse(notation: string): ParsedNotation;
  merge(prev: ParsedNotation, next: ParsedNotation): ParsedNotation;
}

export function mergeParsedNotation(prevNotation: NotationObject, newNotation: NotationObject): ParsedNotation {
  return {
    notation: `${prevNotation.notation}+${newNotation.notation}`,
    constant: (prevNotation.constant ?? 0) + (newNotation.constant ?? 0),
    op: prevNotation.op ?? '',
    boost: prevNotation.boost ?? 1,
    result: prevNotation.result ? [...prevNotation.result] : [],
    error: prevNotation.error ?? false,
    set: [...prevNotation.set, ...newNotation.set],
    vectors: [
      ...(prevNotation.vectors || []),
      ...(newNotation.vectors || []),
    ],
  };
}

export class DiceNotation {
  #set: DiceSet[] = [];
  #setkeys = new Map<string, number>();
  #setid = 0;
  #totalDice = 0;
  #op = '';
  #constant: number | null = null;
  #result: string[] = [];
  #error = false;
  #boost = 1;
  #notation = '';
  #vectors: ThrowVector[] = [];

  constructor(notation: string | NotationObject) {
    if (typeof notation === 'object') {
      notation = notation.notation;
    }

    if (!notation || notation === '0') {
      this.#error = true;
      return;
    }

    this.parseNotation(notation);
  }

  get error() {
    return this.#error;
  }

  get notation() {
    return this.#notation;
  }

  get result() {
    return this.#result;
  }

  get boost() {
    return this.#boost;
  }

  get set() {
    return this.#set;
  }

  get constant() {
    return this.#constant;
  }

  get op() {
    return this.#op;
  }

  get vectors() {
    return this.#vectors;
  }

  parseNotation(notation: string): void {
    if (!notation) return;

    const rageCount = (notation.match(/!/g) || []).length;
    if (rageCount > 0) {
      this.#boost = Math.min(Math.max(rageCount, 0), 3) * 4;
      notation = notation.replace(/!/g, '');
    }

    notation = notation.replace(/\s+/g, '');

    const groupStarts = (notation.match(/\(/g) || []).length;
    const groupEnds = (notation.match(/\)/g) || []).length;

    if (groupStarts !== groupEnds) {
      this.#error = true;
      return;
    }

    const initialOp = this.#notation.length > 0 ? '+' : '';
    this.#notation = this.#notation + initialOp + notation;

    const [notationPart, forcedResults] = notation.split('@');
    let notationString = notationPart;

    const rollRegex =
      /(\+|\-|\*|\/|\%|\^|){0,1}()(\d*)([a-z]+\d+|[a-z]+|)(?:\[(\w+)\])?(?:\{([a-z]+)(.*?|)\}|)()/i;
    const resultsRegex = /(\b)*(\-\d+|\d+)(\b)*/gi;

    let runs = 0;
    const BREAK_LIMIT = 30;
    let groupLevel = 0;
    let groupID = 0;

    while (!this.#error && notationString.length > 0 && runs < BREAK_LIMIT) {
      const match = rollRegex.exec(notationString);
      if (!match) break;

      runs++;

      const [
        fullMatch,
        operator,
        groupStart,
        amount,
        type,
        styleMatch = '',
        funcname = '',
        funcargs = '',
        groupEnd,
      ] = match;
      notationString = notationString.substring(fullMatch.length);

      const hasGroupStart = groupStart && groupStart.length > 0;
      const hasGroupEnd = groupEnd && groupEnd.length > 0;
      let addSet = true;

      if (hasGroupStart) {
        groupLevel += groupStart.length;
      }

      const parsedFuncArgs = funcargs.split(',').slice(1);

      const style = styleMatch?.toLowerCase() as DiceSetStyle | undefined;

      if (
        runs === 1 &&
        notationString.length === 0 &&
        !type &&
        operator &&
        amount
      ) {
        this.#op = operator;
        this.#constant = parseInt(amount, 10);
        this.addSet(
          1,
          'd20',
          groupID,
          groupLevel,
          funcname,
          parsedFuncArgs,
          operator,
          'd20'
        );
      } else if (runs > 1 && notationString.length === 0 && !type) {
        this.#op = operator;
        this.#constant = parseInt(amount, 10);
        addSet = false;
      } else if (addSet) {
        const effectiveStyle: DiceSetStyle | undefined = type === 'd20' ? 'd20' : style;

        this.addSet(
          amount,
          type,
          groupID,
          groupLevel,
          funcname,
          parsedFuncArgs,
          operator,
          effectiveStyle
        );
      }

      if (hasGroupEnd) {
        groupLevel -= groupEnd.length;
        groupID += groupEnd.length;
      }
    }

    if (!this.#error && forcedResults) {
      const results = forcedResults.match(resultsRegex);
      if (results) {
        this.#result = [...results];
      }
    }
  }

  stringify(full = true) {
    if (this.#set.length === 0) return '';

    const output = this.#set.reduce((acc, set, index) => {
      const operator = index > 0 && set.op ? set.op : '';
      const funcString = set.func
        ? `{${set.func}${set.args
          ? ',' + (Array.isArray(set.args) ? set.args.join(',') : set.args)
          : ''
        }}`
        : '';
      return `${acc}${operator}${set.num}${set.type}${funcString}`;
    }, '');

    const constantString = this.#constant
      ? `${this.#op}${Math.abs(this.#constant)}`
      : '';
    const resultString =
      full && this.#result.length > 0 ? `@${this.#result.join(',')}` : '';
    const boostString = this.#boost > 1 ? '!'.repeat(this.#boost / 4) : '';

    return `${output}${constantString}${resultString}${boostString}`;
  }

  addSet(
    amount: string | number,
    type: string,
    groupID = 0,
    groupLevel = 0,
    funcname = '',
    funcargs: string | string[] = '',
    operator = '+',
    style?: DiceSetStyle
  ): void {
    const parsedAmount = Math.abs(parseInt(amount.toString() || '1', 10));
    if (parsedAmount === 0) return;

    const setKey = `${operator}${type}${groupID}${groupLevel}${funcname}${funcargs}${style || ''}`;
    const existingSetIndex = this.#setkeys.get(setKey);

    if (existingSetIndex !== undefined) {
      const existingSet = this.#set[existingSetIndex];
      existingSet.num += parsedAmount;
    } else {
      const newSet: DiceSet = {
        num: parsedAmount,
        type,
        sid: this.#setid,
        gid: groupID,
        glvl: groupLevel,
        ...(funcname && { func: funcname }),
        ...(funcargs && { args: funcargs }),
        ...(operator && { op: operator }),
        ...(style && { style }),
      };

      this.#setkeys.set(setKey, this.#set.length);
      this.#set.push(newSet);
      this.#setid++;
    }
  }

  static mergeNotation(prevNotation: NotationObject, newNotation: NotationObject): ParsedNotation {
    return mergeParsedNotation(prevNotation, newNotation);
  }
}

export class LegacyNotationParser implements NotationParser {
  parse(notation: string): ParsedNotation {
    const legacy = new DiceNotation(notation);
    return {
      notation: legacy.notation,
      constant: legacy.constant,
      op: legacy.op,
      boost: legacy.boost,
      result: legacy.result,
      error: legacy.error,
      vectors: legacy.vectors,
      set: legacy.set,
    };
  }

  merge(prev: ParsedNotation, next: ParsedNotation): ParsedNotation {
    return mergeParsedNotation(prev, next);
  }
}

interface CanonicalSet {
  num: number;
  type: string;
  op: string;
  style?: DiceSetStyle;
}

function facesToType(faces: FacesSpec): string | null {
  switch (faces.kind) {
    case 'number':
      return `d${faces.value}`;
    case 'percentile':
      return 'd100';
    case 'coin':
      return 'd2';
    default:
      return null;
  }
}

export function rollExprToParsedNotation(expr: RollExpr, source: string): ParsedNotation | null {
  const sets: CanonicalSet[] = [];
  let constant: number | null = null;
  let constantOp = '+';

  const visit = (node: RollExpr, op: string, isFirst: boolean, isLast: boolean): boolean => {
    if (typeof node === 'number') {
      if (isFirst || !isLast || constant !== null) return false;
      constant = Math.abs(node);
      constantOp = node < 0 ? '-' : op;
      return true;
    }
    if (typeof node !== 'object' || node === null) return false;

    if ('+' in node) {
      const [left, right] = node['+'];
      return visit(left, op, isFirst, false) && visit(right, '+', false, isLast);
    }
    if ('-' in node) {
      const args = node['-'];
      if (args.length !== 2) return false;
      const [left, right] = args;
      return visit(left, op, isFirst, false) && visit(right, '-', false, isLast);
    }

    if (!('type' in node) || node.type !== 'die') return false;
    if (node.modifiers?.length) return false;
    if (typeof node.count !== 'number' || !Number.isInteger(node.count) || node.count === 0) return false;

    const type = facesToType(node.faces);
    if (!type) return false;

    sets.push({
      num: Math.abs(node.count),
      type,
      op,
      style: type === 'd20' ? 'd20' : undefined,
    });
    return true;
  };

  if (!visit(expr, '', true, true)) return null;
  if (sets.length === 0) return null;

  const diceSets: DiceSet[] = [];
  const setKeys = new Map<string, number>();

  for (const term of sets) {
    const setKey = `${term.op}${term.type}00${term.style || ''}`;
    const existingIndex = setKeys.get(setKey);
    if (existingIndex !== undefined) {
      diceSets[existingIndex].num += term.num;
    } else {
      setKeys.set(setKey, diceSets.length);
      diceSets.push({
        num: term.num,
        type: term.type,
        sid: diceSets.length,
        gid: 0,
        glvl: 0,
        ...(term.op && { op: term.op }),
        ...(term.style && { style: term.style }),
      });
    }
  }

  return {
    notation: source,
    constant,
    op: constant === null ? '' : constantOp,
    boost: 1,
    result: [],
    error: false,
    vectors: [],
    set: diceSets,
  };
}

export class CanonicalNotationParser implements NotationParser {
  constructor(private fallback: NotationParser = new LegacyNotationParser()) {}

  parse(notation: string): ParsedNotation {
    try {
      const expr = fromFormula(notation);
      const parsed = rollExprToParsedNotation(expr, notation);
      if (parsed) return parsed;
    } catch {
      return this.fallback.parse(notation);
    }
    return this.fallback.parse(notation);
  }

  merge(prev: ParsedNotation, next: ParsedNotation): ParsedNotation {
    return mergeParsedNotation(prev, next);
  }
}

export function createDefaultNotationParser(): NotationParser {
  return new CanonicalNotationParser(new LegacyNotationParser());
}
