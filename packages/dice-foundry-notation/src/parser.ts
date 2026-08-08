import type {
  Comparison,
  ComparisonOp,
  DieTerm,
  FacesSpec,
  Modifier,
  ModifierOp,
  Pool,
  RollExpr,
} from '@openvtt/dice-core';
import { tokenize, type Token, type TokenType } from './lexer';
import { FUNCTIONS, MODIFIER_PATTERNS } from './keywords';
import { FoundryNotationError } from './errors';

const COMPARISON_OPS: Partial<Record<TokenType, ComparisonOp>> = {
  eq: '=',
  gt: '>',
  ge: '>=',
  lt: '<',
  le: '<=',
};

export function fromFormula(source: string): RollExpr {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, source);
  return parser.parse();
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  parse(): RollExpr {
    const expr = this.parseExpr();
    if (!this.at('eof')) {
      throw new FoundryNotationError(`Unexpected "${this.peek().text}" after expression`, {
        position: this.peek().start,
        input: this.source,
      });
    }
    return expr;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.eof();
  }

  private eof(): Token {
    const last = this.tokens[this.tokens.length - 1]!;
    return { type: 'eof', text: '', start: last.end, end: last.end };
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new FoundryNotationError('Unexpected end of input', { input: this.source });
    this.pos++;
    return token;
  }

  private expect(type: TokenType, what: string): Token {
    if (!this.at(type)) {
      throw new FoundryNotationError(`Expected ${what}`, {
        position: this.peek().start,
        input: this.source,
      });
    }
    return this.next();
  }

  private parseExpr(): RollExpr {
    let left = this.parseTerm();
    while (this.at('plus') || this.at('dash')) {
      const op = this.next().type === 'plus' ? '+' : '-';
      const right = this.parseTerm();
      left = binary(op, left, right);
    }
    return left;
  }

  private parseTerm(): RollExpr {
    let left = this.parseFactor();
    while (this.at('star') || this.at('slash')) {
      const op = this.next().type === 'star' ? '*' : '/';
      const right = this.parseFactor();
      left = binary(op, left, right);
    }
    return left;
  }

  private parseFactor(): RollExpr {
    if (this.at('dash')) {
      this.next();
      return { '-': [this.parseFactor()] } as RollExpr;
    }

    if (this.at('num')) {
      const value = this.next().value!;
      if (isDieSep(this.peek())) return this.parseDie(value);
      return value;
    }

    if (this.at('lparen')) {
      const expr = this.parseParen();
      if (isDieSep(this.peek())) return this.parseDie(expr);
      return expr;
    }

    if (this.at('word') && isDieSep(this.peek())) {
      return this.parseDie(1);
    }

    if (this.at('lbrace')) return this.parsePool();
    if (this.at('at')) return this.parseDataPath();

    if (this.at('word')) {
      const name = this.peek().text;
      if ((FUNCTIONS as readonly string[]).includes(name) && this.peek(1).type === 'lparen') {
        return this.parseFuncCall();
      }
    }

    throw new FoundryNotationError(`Unexpected "${this.peek().text || this.peek().type}"`, {
      position: this.peek().start,
      input: this.source,
    });
  }

  private parseParen(): RollExpr {
    this.expect('lparen', '"("');
    const expr = this.parseExpr();
    this.expect('rparen', '")"');
    return expr;
  }

  private parseDie(count: RollExpr): DieTerm {
    this.consumeDieSep();
    const faces = this.parseFaces();
    const modifiers = this.parseModifiers();
    return { type: 'die', count, faces, modifiers: modifiers.length ? modifiers : undefined };
  }

  private consumeDieSep(): void {
    const tok = this.peek();
    if (tok.type !== 'word' || !/^[dD]/.test(tok.text)) {
      throw new FoundryNotationError('Expected die separator "d"', {
        position: tok.start,
        input: this.source,
      });
    }
    if (tok.text.length === 1) {
      this.pos++;
      return;
    }
    const rest = tok.text.slice(1);
    this.tokens[this.pos] = {
      type: 'word',
      text: rest,
      start: tok.start + 1,
      end: tok.end,
    };
  }

  private parseFaces(): FacesSpec {
    if (this.at('num')) return { kind: 'number', value: this.next().value! };
    if (this.at('percent')) {
      this.next();
      return { kind: 'percentile' };
    }
    if (this.at('lparen')) return { kind: 'expr', value: this.parseParen() };
    if (this.at('word')) {
      const text = this.peek().text.toLowerCase();
      if (text === 'f' || text === 'fate') {
        this.next();
        return { kind: 'fate' };
      }
      if (text === 'c' || text === 'coin') {
        this.next();
        return { kind: 'coin' };
      }
    }
    throw new FoundryNotationError('Expected die faces (e.g. 6, %, f, coin)', {
      position: this.peek().start,
      input: this.source,
    });
  }

  private parsePool(): Pool {
    this.expect('lbrace', '"{"');
    const entries: RollExpr[] = [this.parseExpr()];
    while (this.at('comma')) {
      this.next();
      entries.push(this.parseExpr());
    }
    this.expect('rbrace', '"}"');
    const modifiers = this.parseModifiers();
    return { type: 'pool', entries, modifiers: modifiers.length ? modifiers : undefined };
  }

  private parseDataPath(): RollExpr {
    this.expect('at', '"@"');
    const first = this.expect('word', 'a path name').text;
    let path = first;
    while (this.at('dot')) {
      this.next();
      path += '.' + this.expect('word', 'a path segment').text;
    }
    return { var: path } as RollExpr;
  }

  private parseFuncCall(): RollExpr {
    const name = this.next().text;
    this.expect('lparen', '"("');
    const args: RollExpr[] = [];
    if (!this.at('rparen')) {
      args.push(this.parseExpr());
      while (this.at('comma')) {
        this.next();
        args.push(this.parseExpr());
      }
    }
    this.expect('rparen', '")"');
    return { [name]: args } as unknown as RollExpr;
  }

  private parseModifiers(): Modifier[] {
    const modifiers: Modifier[] = [];
    for (;;) {
      const match = this.matchModifier();
      if (!match) break;
      modifiers.push(this.parseModifierArgs(match));
    }
    return modifiers;
  }

  private matchModifier(): ModifierOp | null {
    for (const pattern of MODIFIER_PATTERNS) {
      if (this.matchesPattern(pattern.tokens)) return pattern.op;
    }
    return null;
  }

  private matchesPattern(pattern: readonly string[]): boolean {
    for (let i = 0; i < pattern.length; i++) {
      const token = this.peek(i);
      if (token.text !== pattern[i]) return false;
    }
    this.pos += pattern.length;
    return true;
  }

  private parseModifierArgs(op: ModifierOp): Modifier {
    if (op === 'keep-highest' || op === 'keep-lowest' || op === 'drop-highest' || op === 'drop-lowest') {
      const mod: ModBuilder = { op };
      if (this.at('num')) mod.count = this.next().value!;
      return mod;
    }
    if (op === 'min' || op === 'max') {
      const value = this.expect('num', 'a clamp value').value!;
      return { op, value };
    }
    if (op === 'margin-success') {
      const target = this.expect('num', 'a target value').value!;
      return { op, target };
    }
    if (op === 'reroll-once' || op === 'reroll-recursive') {
      const compare = this.tryRerollComparison();
      return compare ? { op, compare } : { op };
    }
    if (op === 'explode' || op === 'explode-once') {
      const compare = this.tryComparison();
      return compare ? { op, compare } : { op };
    }
    if (op === 'count-success' || op === 'count-failure') {
      const compare = this.tryComparison();
      return compare ? { op, compare } : { op };
    }
    return { op };
  }

  private isComparisonStart(): boolean {
    return COMPARISON_OPS[this.peek().type] !== undefined;
  }

  private tryComparison(): Comparison | undefined {
    if (!this.isComparisonStart()) return undefined;
    const op = COMPARISON_OPS[this.next().type]!;
    const value = this.parseComparisonValue();
    return { op, value };
  }

  private tryRerollComparison(): Comparison | undefined {
    if (this.isComparisonStart()) return this.tryComparison();
    if (this.at('num')) {
      const value = this.next().value!;
      return { op: '=', value };
    }
    return undefined;
  }

  private parseComparisonValue(): RollExpr {
    if (this.at('num')) return this.next().value!;
    if (this.at('lparen')) return this.parseParen();
    if (this.at('at')) return this.parseDataPath();
    throw new FoundryNotationError('Expected a value, parenthesised expression, or @path', {
      position: this.peek().start,
      input: this.source,
    });
  }
}

function binary(op: '+' | '-' | '*' | '/', left: RollExpr, right: RollExpr): RollExpr {
  switch (op) {
    case '+':
      return { '+': [left, right] };
    case '-':
      return { '-': [left, right] };
    case '*':
      return { '*': [left, right] };
    case '/':
      return { '/': [left, right] };
  }
}

interface ModBuilder {
  op: ModifierOp;
  count?: number;
  value?: number;
  target?: number;
  cap?: number;
  compare?: Comparison;
}

function isDieSep(token: Token): boolean {
  return token.type === 'word' && /^[dD]/.test(token.text);
}
