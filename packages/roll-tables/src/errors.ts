export type TableErrorCode =
  | 'empty-table'
  | 'deck-exhausted'
  | 'cycle-detected'
  | 'max-depth'
  | 'unknown-table-ref'
  | 'invalid-formula'
  | 'invalid-range'
  | 'condition-error';

export class TableError extends Error {
  readonly code: TableErrorCode;
  readonly tableId?: string;

  constructor(code: TableErrorCode, message: string, tableId?: string) {
    super(message);
    this.name = 'TableError';
    this.code = code;
    this.tableId = tableId;
  }
}
