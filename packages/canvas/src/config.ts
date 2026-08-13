export type GridType = 'none' | 'square' | 'hex-vertical' | 'hex-horizontal' | 'isometric';

export interface GridConfig {
  type: GridType;
  size: number;
  color?: number | string;
  alpha?: number;
  lineWidth?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface CanvasConfig {
  background: number;
  minScale: number;
  maxScale: number;
  grid: Required<Pick<GridConfig, 'color' | 'alpha' | 'lineWidth'>>;
  selection: { color: number; alpha: number; width: number };
  token: { fallbackColor: number; alpha: number };
  wall: { color: number; doorColor: number; secretColor: number; width: number; freehandTolerance: number; curveSegments: number };
}

export const CONFIG: CanvasConfig = {
  background: 0x1a1a2e,
  minScale: 0.2,
  maxScale: 4,
  grid: { color: 0x000000, alpha: 0.3, lineWidth: 1 },
  selection: { color: 0xf59e0b, alpha: 0.8, width: 3 },
  token: { fallbackColor: 0x4a90d9, alpha: 0.8 },
  wall: { color: 0xf59e0b, doorColor: 0xa855f7, secretColor: 0x22d3ee, width: 3, freehandTolerance: 8, curveSegments: 16 },
};

export function configure(partial: Partial<CanvasConfig>): void {
  if (partial.background !== undefined) CONFIG.background = partial.background;
  if (partial.minScale !== undefined) CONFIG.minScale = partial.minScale;
  if (partial.maxScale !== undefined) CONFIG.maxScale = partial.maxScale;
  if (partial.grid) Object.assign(CONFIG.grid, partial.grid);
  if (partial.selection) Object.assign(CONFIG.selection, partial.selection);
  if (partial.token) Object.assign(CONFIG.token, partial.token);
  if (partial.wall) Object.assign(CONFIG.wall, partial.wall);
}
