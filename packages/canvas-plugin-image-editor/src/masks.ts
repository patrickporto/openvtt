/**
 * Máscaras de recorte do token. Interface única (`MaskShape`) + registry
 * extensível: máscaras built-in são geometria pura (normalizada 0..1) e
 * consumidores podem registrar shapes customizados (Path2D) sem tocar no
 * pipeline do composer (aberto para extensão, fechado para modificação).
 */

export interface MaskShape {
  readonly id: string;
  readonly label: string;
  /**
   * Vértices normalizados (0..1) da máscara, quando a forma é poligonal.
   * Usados para preview leve e para cálculo de bounding sem canvas.
   */
  readonly polygon?: ReadonlyArray<readonly [number, number]>;
  /**
   * Constrói o Path2D da máscara numa caixa `size × size` (origem 0,0).
   * Formas curvas (círculo, cantos arredondados) implementam apenas isto.
   */
  readonly path?: (size: number) => Path2D;
}

/** Fallback gravável quando Path2D não existe no runtime (tests/headless). */
class RecordingPath {
  moveTo(...args: number[]): void { void args; }
  lineTo(...args: number[]): void { void args; }
  arc(...args: number[]): void { void args; }
  arcTo(...args: number[]): void { void args; }
  closePath(): void {}
}

const Path2DCtor = (globalThis as { Path2D?: unknown }).Path2D ?? RecordingPath;

function newPath(): Path2D {
  return new (Path2DCtor as new () => Path2D)();
}

function polygonPath(points: ReadonlyArray<readonly [number, number]>): (size: number) => Path2D {
  return (size: number) => {
    const p = newPath();
    points.forEach(([nx, ny], i) => {
      const x = nx * size;
      const y = ny * size;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    });
    p.closePath();
    return p;
  };
}

function mask(id: string, label: string, polygon?: MaskShape['polygon'], path?: MaskShape['path']): MaskShape {
  return { id, label, polygon, path: path ?? (polygon ? polygonPath(polygon) : undefined) };
}

export { mask as maskFrom };

const SQRT3_2 = Math.sqrt(3) / 2;

/** Hexágono pointy-top inscrito na caixa 0..1 (grid hex-vertical). */
export function hexVerticalVertices(): Array<[number, number]> {
  return [
    [0.5, 0],
    [0.5 + SQRT3_2 / 2, 0.25],
    [0.5 + SQRT3_2 / 2, 0.75],
    [0.5, 1],
    [0.5 - SQRT3_2 / 2, 0.75],
    [0.5 - SQRT3_2 / 2, 0.25],
  ];
}

/** Hexágono flat-top inscrito na caixa 0..1 (grid hex-horizontal). */
export function hexHorizontalVertices(): Array<[number, number]> {
  return [
    [0.25, 0.5 - SQRT3_2 / 2],
    [0.75, 0.5 - SQRT3_2 / 2],
    [1, 0.5],
    [0.75, 0.5 + SQRT3_2 / 2],
    [0.25, 0.5 + SQRT3_2 / 2],
    [0, 0.5],
  ];
}

function circleMask(): MaskShape {
  return {
    id: 'circle',
    label: 'Circle',
    path: (size) => {
      const p = newPath();
      p.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      return p;
    },
  };
}

function roundedMask(radius = 0.125): MaskShape {
  return {
    id: 'rounded',
    label: 'Rounded',
    path: (size) => {
      const r = size * radius;
      const p = newPath();
      p.moveTo(r, 0);
      p.lineTo(size - r, 0);
      p.arcTo(size, 0, size, r, r);
      p.lineTo(size, size - r);
      p.arcTo(size, size, size - r, size, r);
      p.lineTo(r, size);
      p.arcTo(0, size, 0, size - r, r);
      p.lineTo(0, r);
      p.arcTo(0, 0, r, 0, r);
      p.closePath();
      return p;
    },
  };
}

const BUILTINS: MaskShape[] = [
  circleMask(),
  mask('square', 'Square', [[0, 0], [1, 0], [1, 1], [0, 1]]),
  roundedMask(),
  mask('hex-vertical', 'Hex (pointy)', hexVerticalVertices()),
  mask('hex-horizontal', 'Hex (flat)', hexHorizontalVertices()),
];

export class MaskRegistry {
  private readonly shapes = new Map<string, MaskShape>();
  private readonly order: string[] = [];

  constructor(builtins: MaskShape[] = BUILTINS) {
    for (const shape of builtins) this.register(shape);
  }

  register(shape: MaskShape): void {
    if (!shape.id) throw new Error('[image-editor] mask id is required');
    if (!this.shapes.has(shape.id)) this.order.push(shape.id);
    this.shapes.set(shape.id, shape);
  }

  get(id: string): MaskShape | undefined {
    return this.shapes.get(id);
  }

  /** Exige a máscara; fallback para circle quando custom não registrado. */
  resolve(id: string | MaskShape): MaskShape {
    if (typeof id !== 'string') return id;
    return this.shapes.get(id) ?? this.shapes.get('circle')!;
  }

  list(): MaskShape[] {
    return this.order.map((id) => this.shapes.get(id)!);
  }
}

export const imageMasks = new MaskRegistry();

/** Cria uma máscara poligonal customizada a partir de vértices normalizados. */
export function polygonMask(id: string, label: string, points: ReadonlyArray<readonly [number, number]>): MaskShape {
  return mask(id, label, points);
}

/** Cria uma máscara customizada a partir de uma fábrica de Path2D. */
export function pathMask(id: string, label: string, factory: (size: number) => Path2D): MaskShape {
  return { id, label, path: factory };
}
