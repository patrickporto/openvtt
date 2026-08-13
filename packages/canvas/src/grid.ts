import type { Graphics } from 'pixi.js';
import type { GridConfig, GridType } from './config';
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
        this.drawHex(graphics, width, height, size, 'vertical', options);
        return;
      case 'hex-horizontal':
        this.drawHex(graphics, width, height, size, 'horizontal', options);
        return;
      case 'isometric':
        this.drawIsometric(graphics, width, height, size, options);
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
  ): void {
    if (orientation === 'vertical') {
      const hexHeight = size;
      const hexWidth = (Math.sqrt(3) / 2) * hexHeight;
      const vertDist = hexHeight * 0.75;
      for (let row = 0; row * vertDist < height + hexHeight; row++) {
        for (let col = 0; col * hexWidth < width + hexWidth; col++) {
          const ox = row % 2 === 1 ? hexWidth / 2 : 0;
          this.traceHexagon(graphics, col * hexWidth + ox, row * vertDist, size / 2, true);
        }
      }
    } else {
      const hexWidth = size;
      const hexHeight = (Math.sqrt(3) / 2) * hexWidth;
      const horizDist = hexWidth * 0.75;
      for (let col = 0; col * horizDist < width + hexWidth; col++) {
        for (let row = 0; row * hexHeight < height + hexHeight; row++) {
          const oy = col % 2 === 1 ? hexHeight / 2 : 0;
          this.traceHexagon(graphics, col * horizDist, row * hexHeight + oy, size / 2, false);
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
  ): void {
    const isoWidth = size;
    const isoHeight = size / 2;
    const numDiagonals = Math.ceil((width + height) / isoWidth) * 2;
    for (let i = -numDiagonals; i <= numDiagonals; i++) {
      const startX = i * isoWidth;
      graphics.moveTo(startX, 0);
      graphics.lineTo(startX + height * (isoWidth / isoHeight), height);
      const startX2 = i * isoWidth;
      graphics.moveTo(startX2, 0);
      graphics.lineTo(startX2 - height * (isoWidth / isoHeight), height);
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
      const isoWidth = size;
      const isoHeight = size / 2;
      const ax = x - offsetX;
      const ay = y - offsetY;
      const isoX = ax / isoWidth + ay / isoHeight;
      const isoY = ay / isoHeight - ax / isoWidth;
      const tileX = Math.floor(isoX);
      const tileY = Math.floor(isoY);
      const cenIsoX = tileX + 0.5;
      const cenIsoY = tileY + 0.5;
      const cx = ((cenIsoX - cenIsoY) * isoWidth) / 2 + offsetX;
      const cy = ((cenIsoX + cenIsoY) * isoHeight) / 2 + offsetY;
      return {
        type: 'poly',
        data: [cx, cy - isoHeight / 2, cx + isoWidth / 2, cy, cx, cy + isoHeight / 2, cx - isoWidth / 2, cy],
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
