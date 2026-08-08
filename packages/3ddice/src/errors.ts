export class DiceError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DiceError';
    this.code = code;
  }
}

export class RollCancelledError extends DiceError {
  constructor(message = 'Roll cancelled') {
    super(message, 'ROLL_CANCELLED');
    this.name = 'RollCancelledError';
  }
}

export class AssetLoadError extends DiceError {
  constructor(message: string) {
    super(message, 'ASSET_LOAD');
    this.name = 'AssetLoadError';
  }
}
