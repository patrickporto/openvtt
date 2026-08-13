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
import { EXPLODE_OPS, FAILURE_OPS, FUNCTIONS, KEEP_DROP_OPS } from './keywords';
import type { DialectConfig } from './dialect';

const COMPARISON_OPS: Partial<Record<TokenType, ComparisonOp>> = {
  eq: '=',
  gt: '>',
  ge: '>=',
  lt: '<',
  le: '<=',
};

export function fromFormula(dialect: DialectConfig, source: string): RollExpr {
  const tokens = tokenize(source);
  const parser = new Parser(dialect, tokens, source);
  return parser.parse();
}

class Parser {
  private pos = 0;
  private remainder: Token | null = null;

  constructor(
    private readonly dialect: DialectConfig,
    private readonly tokens: readonly Token[],
    private readonly source: string,
  ) {}

  parse(): RollExpr {
    const expr = this.parseExpr();
    if (!this.at('eof')) {
      throw this.error(`Unexpected "${this.peek().text}" after expression`, this.peek().start);
    }
    return expr;
  }

  private error(message: string, position?: number): Error {
    return this.dialect.createError(message, { position, input: this.source });
  }

  private peek(offset = 0): Token {
    if (this.remainder) {
      if (offset === 0) return this.remainder;
      return this.tokens[this.pos + offset] ?? this.eof();
    }
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
    if (this.remainder) {
      const token = this.remainder;
      this.remainder = null;
      this.pos++;
      return token;
    }
    const token = this.tokens[this.pos];
    if (!token) throw this.error('Unexpected end of input');
    this.pos++;
    return token;
  }

  private advance(count: number): void {
    this.pos += count;
  }

  private expect(type: TokenType, what: string): Token {
    if (!this.at(type)) {
      throw this.error(`Expected ${what}`, this.peek().start);
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
    if (this.at('at')) return this.parseVarRef();

    if (this.at('word')) {
      const name = this.peek().text;
      if (FUNCTIONS.includes(name) && this.peek(1).type === 'lparen') {
        return this.parseFuncCall();
      }
    }

    throw this.error(`Unexpected "${this.peek().text || this.peek().type}"`, this.peek().start);
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
      throw this.error('Expected die separator "d"', tok.start);
    }
    if (tok.text.length === 1) {
      this.pos++;
      return;
    }
    this.remainder = {
      type: 'word',
      text: tok.text.slice(1),
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
      if (this.dialect.coinFaces && (text === 'coin' || text === 'c')) {
        this.next();
        return { kind: 'coin' };
      }
    }
    throw this.error(`Expected die faces (e.g. ${this.dialect.facesHint})`, this.peek().start);
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

  private parseVarRef(): RollExpr {
    if (this.dialect.bracedAttributes) {
      this.expect('at', '"@"');
      this.expect('lbrace', '"{"');
      const parts: string[] = [this.expect('word', 'an attribute name').text];
      while (this.at('pipe') || this.at('dot')) {
        this.next();
        parts.push(this.expect('word', 'an attribute name').text);
      }
      this.expect('rbrace', '"}"');
      return { var: parts.join('.') } as RollExpr;
    }
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
      if (this.dialect.implicitCountSuccess) {
        const implicitCompare = this.tryComparison();
        if (implicitCompare) {
          modifiers.push({ op: 'count-success', compare: implicitCompare });
          continue;
        }
      }
      const ambiguous = this.peek().type === 'word' && this.isAmbiguous(this.peek().text);
      if (ambiguous) {
        throw this.error(
          `Ambiguous alias "${this.peek().text}" is rejected; use the full canonical name`,
          this.peek().start,
        );
      }
      const match = this.matchModifier();
      if (!match) break;
      modifiers.push(this.parseModifierArgs(match));
    }
    return modifiers;
  }

  private isAmbiguous(text: string): boolean {
    return this.dialect.ambiguousAliases.includes(text);
  }

  private matchModifier(): ModifierOp | null {
    for (const pattern of this.dialect.modifierPatterns) {
      if (this.peekMatches(pattern.tokens)) {
        this.advance(pattern.tokens.length);
        return pattern.op;
      }
    }
    return null;
  }

  private peekMatches(pattern: readonly string[]): boolean {
    for (let i = 0; i < pattern.length; i++) {
      if (this.peek(i).text !== pattern[i]) return false;
    }
    return true;
  }

  private parseModifierArgs(op: ModifierOp): Modifier {
    if (this.dialect.noArgOps.includes(op)) {
      return { op };
    }
    if (KEEP_DROP_OPS.includes(op)) {
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
      const compare = this.dialect.rerollBareNumber
        ? this.tryRerollComparison()
        : this.tryComparison();
      return compare ? { op, compare } : { op };
    }
    if (EXPLODE_OPS.includes(op)) {
      const mod: ModBuilder = { op };
      if (this.dialect.explodeCap && this.at('num') && !this.isComparisonStart()) {
        mod.cap = this.next().value!;
      }
      const compare = this.tryComparison();
      if (compare) mod.compare = compare;
      return mod;
    }
    if (op === 'count-success' || FAILURE_OPS.includes(op)) {
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
    if (this.at('at')) return this.parseVarRef();
    const hint = this.dialect.bracedAttributes ? '@{attr}' : '@path';
    throw this.error(
      `Expected a value, parenthesised expression, or ${hint}`,
      this.peek().start,
    );
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
