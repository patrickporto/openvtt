import type { Graphics } from 'pixi.js';
import { CONFIG, type GridConfig, type GridType } from './config';
import { toHex } from './utils';

export interface StrokeOptions {
  color: number;
  width: number;
  alpha: number;
}

export interface CellShape {
  type: 'rect' | 'poly';
  data: number[];
}

export interface CellIndex {
  col: number;
  row: number;
}

const GRID_KEYS = ['type', 'size', 'color', 'alpha', 'lineWidth', 'offsetX', 'offsetY'] as const;

/**
 * Estado do grid como serviço do core: plugins leem `canvas.grid` para
 * conversões célula/pixel e snapping; a renderização do grid é contribuída
 * pelo plugin `@openvtt/canvas-plugin-grid`, que observa `grid:change`.
 */
export class GridService implements GridConfig {
  type: GridType;
  size: number;
  color?: number | string;
  alpha?: number;
  lineWidth?: number;
  offsetX?: number;
  offsetY?: number;

  constructor(
    defaults: Partial<GridConfig> = {},
    private readonly notify?: (grid: GridConfig) => void,
  ) {
    this.type = defaults.type ?? 'square';
    this.size = defaults.size ?? 50;
    this.color = defaults.color ?? CONFIG.grid.color;
    this.alpha = defaults.alpha ?? CONFIG.grid.alpha;
    this.lineWidth = defaults.lineWidth ?? CONFIG.grid.lineWidth;
    this.offsetX = defaults.offsetX;
    this.offsetY = defaults.offsetY;
  }

  set(changes: Partial<GridConfig>): void {
    this.apply(changes);
  }

  reset(config: Partial<GridConfig> = {}): void {
    this.apply({
      type: 'square',
      size: 50,
      color: CONFIG.grid.color,
      alpha: CONFIG.grid.alpha,
      lineWidth: CONFIG.grid.lineWidth,
      offsetX: undefined,
      offsetY: undefined,
      ...config,
    });
  }

  setType(type: GridType): void {
    this.set({ type });
  }

  setSize(size: number): void {
    this.set({ size });
  }

  snapshot(): GridConfig {
    return {
      type: this.type,
      size: this.size,
      color: this.color,
      alpha: this.alpha,
      lineWidth: this.lineWidth,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
  }

  snapToGrid(x: number, y: number): { x: number; y: number } {
    return GridRenderer.snapToGrid(x, y, this.type, this.size, this.offsetX ?? 0, this.offsetY ?? 0);
  }

  snapToIntersection(x: number, y: number): { x: number; y: number } {
    return GridRenderer.snapToIntersection(x, y, this.type, this.size, this.offsetX ?? 0, this.offsetY ?? 0);
  }

  private apply(config: Partial<GridConfig>): void {
    const target = this as Record<string, unknown>;
    const source = config as Record<string, unknown>;
    for (const key of GRID_KEYS) {
      if (key in config) target[key] = source[key];
    }
    this.notify?.(this.snapshot());
  }
}

export class GridRenderer {
  static draw(
    graphics: Graphics,
    width: number,
    height: number,
    type: GridType,
    size: number,
    options: StrokeOptions,
    offsetX = 0,
    offsetY = 0,
  ): void {
    graphics.clear();
    switch (type) {
      case 'none':
        return;
      case 'square':
        this.drawSquare(graphics, width, height, size, options, offsetX, offsetY);
        return;
      case 'hex-vertical':
        this.drawHex(graphics, width, height, size, 'vertical', options, offsetX, offsetY);
        return;
      case 'hex-horizontal':
        this.drawHex(graphics, width, height, size, 'horizontal', options, offsetX, offsetY);
        return;
      case 'isometric':
        this.drawIsometric(graphics, width, height, size, options, offsetX, offsetY);
        return;
    }
  }

  static drawSquare(
    graphics: Graphics,
    width: number,
    height: number,
    size: number,
    options: StrokeOptions,
    offsetX = 0,
    offsetY = 0,
  ): void {
    for (let x = offsetX; x <= width; x += size) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, height);
    }
    for (let y = offsetY; y <= height; y += size) {
      graphics.moveTo(0, y);
      graphics.lineTo(width, y);
    }
    graphics.stroke({ color: options.color, width: options.width, alpha: options.alpha });
  }

  static drawHex(
    graphics: Graphics,
    width: number,
    height: number,
    size: number,
    orientation: 'vertical' | 'horizontal',
    options: StrokeOptions,
    offsetX = 0,
    offsetY = 0,
  ): void {
    if (orientation === 'vertical') {
      const hexHeight = size;
      const hexWidth = (Math.sqrt(3) / 2) * hexHeight;
      const vertDist = hexHeight * 0.75;
      const rowStart = Math.floor((-hexHeight - offsetY) / vertDist);
      for (let row = rowStart; row * vertDist + offsetY < height + hexHeight; row++) {
        const cy = row * vertDist + offsetY;
        const ox = Math.abs(row) % 2 === 1 ? hexWidth / 2 : 0;
        const colStart = Math.floor((-hexWidth - offsetX - ox) / hexWidth);
        for (let col = colStart; col * hexWidth + ox + offsetX < width + hexWidth; col++) {
          this.traceHexagon(graphics, col * hexWidth + ox + offsetX, cy, size / 2, true);
        }
      }
    } else {
      const hexWidth = size;
      const hexHeight = (Math.sqrt(3) / 2) * hexWidth;
      const horizDist = hexWidth * 0.75;
      const colStart = Math.floor((-hexWidth - offsetX) / horizDist);
      for (let col = colStart; col * horizDist + offsetX < width + hexWidth; col++) {
        const cx = col * horizDist + offsetX;
        const oy = Math.abs(col) % 2 === 1 ? hexHeight / 2 : 0;
        const rowStart = Math.floor((-hexHeight - offsetY - oy) / hexHeight);
        for (let row = rowStart; row * hexHeight + oy + offsetY < height + hexHeight; row++) {
          this.traceHexagon(graphics, cx, row * hexHeight + oy + offsetY, size / 2, false);
        }
      }
    }
    graphics.stroke({ color: options.color, width: options.width, alpha: options.alpha });
  }

  private static traceHexagon(
    graphics: Graphics,
    cx: number,
    cy: number,
    radius: number,
    pointyTop: boolean,
  ): void {
    const angleOffset = pointyTop ? Math.PI / 6 : 0;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + angleOffset;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (i === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.closePath();
  }

  static drawIsometric(
    graphics: Graphics,
    width: number,
    height: number,
    size: number,
    options: StrokeOptions,
    offsetX = 0,
    offsetY = 0,
  ): void {
    const isoWidth = size;
    const isoHeight = size / 2;
    const y0 = offsetY - isoHeight * 2;
    const y1 = offsetY + height + isoHeight * 2;
    const span = y1 - y0;
    const numDiagonals = Math.ceil((width + height) / isoWidth) * 2 + 2;
    for (let i = -numDiagonals; i <= numDiagonals; i++) {
      const startX = i * isoWidth + offsetX;
      graphics.moveTo(startX, y0);
      graphics.lineTo(startX + span * (isoWidth / isoHeight), y1);
      graphics.moveTo(startX, y0);
      graphics.lineTo(startX - span * (isoWidth / isoHeight), y1);
    }
    graphics.stroke({ color: options.color, width: options.width, alpha: options.alpha });
  }

  static snapToGrid(
    x: number,
    y: number,
    type: GridType,
    size: number,
    offsetX = 0,
    offsetY = 0,
  ): { x: number; y: number } {
    switch (type) {
      case 'none':
        return { x, y };
      case 'square': {
        const cellX = Math.floor((x - offsetX) / size);
        const cellY = Math.floor((y - offsetY) / size);
        return { x: cellX * size + size / 2 + offsetX, y: cellY * size + size / 2 + offsetY };
      }
      case 'hex-vertical': {
        const hexHeight = size;
        const hexWidth = (Math.sqrt(3) / 2) * hexHeight;
        const vertDist = hexHeight * 0.75;
        const row = Math.round((y - offsetY) / vertDist);
        const hexOffset = Math.abs(row) % 2 === 1 ? hexWidth / 2 : 0;
        const col = Math.round((x - offsetX - hexOffset) / hexWidth);
        return { x: col * hexWidth + hexOffset + offsetX, y: row * vertDist + offsetY };
      }
      case 'hex-horizontal': {
        const hexWidth = size;
        const hexHeight = (Math.sqrt(3) / 2) * hexWidth;
        const horizDist = hexWidth * 0.75;
        const col = Math.round((x - offsetX) / horizDist);
        const hexOffsetY = Math.abs(col) % 2 === 1 ? hexHeight / 2 : 0;
        const row = Math.round((y - offsetY - hexOffsetY) / hexHeight);
        return { x: col * horizDist + offsetX, y: row * hexHeight + hexOffsetY + offsetY };
      }
      case 'isometric': {
        const isoWidth = size;
        const isoHeight = size / 2;
        const ax = x - offsetX;
        const ay = y - offsetY;
        const isoX = ax / isoWidth + ay / isoHeight;
        const isoY = ay / isoHeight - ax / isoWidth;
        const sx = Math.round(isoX);
        const sy = Math.round(isoY);
        return { x: ((sx - sy) * isoWidth) / 2 + offsetX, y: ((sx + sy) * isoHeight) / 2 + offsetY };
      }
      default:
        return { x, y };
    }
  }

  static snapToIntersection(
    x: number,
    y: number,
    type: GridType,
    size: number,
    offsetX = 0,
    offsetY = 0,
  ): { x: number; y: number } {
    if (type === 'square') {
      return {
        x: Math.round((x - offsetX) / size) * size + offsetX,
        y: Math.round((y - offsetY) / size) * size + offsetY,
      };
    }
    return this.snapToGrid(x, y, type, size, offsetX, offsetY);
  }

  static cellIndexOf(
    x: number,
    y: number,
    type: GridType,
    size: number,
    offsetX = 0,
    offsetY = 0,
  ): CellIndex {
    switch (type) {
      case 'square':
        return { col: Math.floor((x - offsetX) / size), row: Math.floor((y - offsetY) / size) };
      case 'hex-vertical': {
        const hexWidth = (Math.sqrt(3) / 2) * size;
        const row = Math.round((y - offsetY) / (size * 0.75));
        const hexOffset = Math.abs(row) % 2 === 1 ? hexWidth / 2 : 0;
        return { col: Math.round((x - offsetX - hexOffset) / hexWidth), row };
      }
      case 'hex-horizontal': {
        const hexHeight = (Math.sqrt(3) / 2) * size;
        const col = Math.round((x - offsetX) / (size * 0.75));
        const hexOffsetY = Math.abs(col) % 2 === 1 ? hexHeight / 2 : 0;
        return { col, row: Math.round((y - offsetY - hexOffsetY) / hexHeight) };
      }
      case 'isometric': {
        const isoWidth = size;
        const isoHeight = size / 2;
        const ax = x - offsetX;
        const ay = y - offsetY;
        return {
          col: Math.round(ax / isoWidth + ay / isoHeight),
          row: Math.round(ay / isoHeight - ax / isoWidth),
        };
      }
      default:
        return { col: Math.round(x), row: Math.round(y) };
    }
  }

  static cellCenterOf(
    col: number,
    row: number,
    type: GridType,
    size: number,
    offsetX = 0,
    offsetY = 0,
  ): { x: number; y: number } {
    switch (type) {
      case 'square':
        return { x: col * size + size / 2 + offsetX, y: row * size + size / 2 + offsetY };
      case 'hex-vertical': {
        const hexWidth = (Math.sqrt(3) / 2) * size;
        const hexOffset = Math.abs(row) % 2 === 1 ? hexWidth / 2 : 0;
        return { x: col * hexWidth + hexOffset + offsetX, y: row * size * 0.75 + offsetY };
      }
      case 'hex-horizontal': {
        const hexHeight = (Math.sqrt(3) / 2) * size;
        const hexOffsetY = Math.abs(col) % 2 === 1 ? hexHeight / 2 : 0;
        return { x: col * size * 0.75 + offsetX, y: row * hexHeight + hexOffsetY + offsetY };
      }
      case 'isometric':
        return { x: ((col - row) * size) / 2 + offsetX, y: ((col + row) * (size / 2)) / 2 + offsetY };
      default:
        return { x: col, y: row };
    }
  }

  static getCellShape(
    x: number,
    y: number,
    type: GridType,
    size: number,
    offsetX = 0,
    offsetY = 0,
  ): CellShape | null {
    if (type === 'none') return null;
    if (type === 'square') {
      const cellX = Math.floor((x - offsetX) / size) * size + offsetX;
      const cellY = Math.floor((y - offsetY) / size) * size + offsetY;
      return { type: 'rect', data: [cellX, cellY, size, size] };
    }
    if (type.startsWith('hex')) {
      const center = this.snapToGrid(x, y, type, size, offsetX, offsetY);
      const points: number[] = [];
      const radius = size / 2;
      const angleOffset = type === 'hex-vertical' ? Math.PI / 6 : 0;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + angleOffset;
        points.push(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
      }
      return { type: 'poly', data: points };
    }
    if (type === 'isometric') {
      const cell = this.cellIndexOf(x, y, type, size, offsetX, offsetY);
      const center = this.cellCenterOf(cell.col, cell.row, type, size, offsetX, offsetY);
      const halfWidth = size / 2;
      const halfHeight = size / 4;
      return {
        type: 'poly',
        data: [
          center.x,
          center.y - halfHeight,
          center.x + halfWidth,
          center.y,
          center.x,
          center.y + halfHeight,
          center.x - halfWidth,
          center.y,
        ],
      };
    }
    return null;
  }

  static strokeOptions(grid: GridConfig, fallback: { color: number; alpha: number; width: number }): StrokeOptions {
    return {
      color: toHex(grid.color ?? fallback.color),
      alpha: grid.alpha ?? fallback.alpha,
      width: grid.lineWidth ?? fallback.width,
    };
  }
}
