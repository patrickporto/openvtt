import {
  createRollTablesBus,
  createTable,
  RandomTable,
  TableError,
  type DrawOptions,
  type DrawResult,
  type DrawnEntry,
  type RollTablesBus,
  type TableDef,
  type TableResolver,
} from '@openvtt/roll-tables';

export class RollTablesRegistry {
  readonly bus: RollTablesBus = createRollTablesBus();
  private readonly tables = new Map<string, RandomTable>();
  private readonly names = new Map<string, string>();

  readonly resolver: TableResolver = {
    get: (ref) => this.get(ref),
  };

  register(input: TableDef | RandomTable): RandomTable {
    const table =
      input instanceof RandomTable
        ? input
        : createTable(input, { bus: this.bus, resolver: this.resolver });
    this.tables.set(table.id, table);
    if (!this.names.has(table.name)) this.names.set(table.name, table.id);
    return table;
  }

  unregister(ref: string): boolean {
    const table = this.get(ref);
    if (!table) return false;
    this.tables.delete(table.id);
    if (this.names.get(table.name) === table.id) this.names.delete(table.name);
    return true;
  }

  get(ref: string): RandomTable | undefined {
    const byId = this.tables.get(ref);
    if (byId) return byId;
    const named = this.names.get(ref);
    return named ? this.tables.get(named) : undefined;
  }

  list(): readonly RandomTable[] {
    return [...this.tables.values()];
  }

  draw(ref: string, options?: DrawOptions): DrawResult {
    const table = this.get(ref);
    if (!table) {
      throw new TableError('unknown-table-ref', `No table registered for "${ref}"`);
    }
    return table.draw(options);
  }
}

export function flattenDraw(result: DrawResult): string[] {
  const out: string[] = [];
  const walk = (draws: readonly DrawnEntry[]): void => {
    for (const draw of draws) {
      if (draw.nested) {
        walk(draw.nested.draws);
      } else {
        out.push(draw.text ?? (draw.value != null ? String(draw.value) : '?'));
      }
    }
  };
  walk(result.draws);
  return out;
}
