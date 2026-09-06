import './globals';
import { describe, expect, it } from 'bun:test';
import { affectedCells, footprintOf, pointInPolygon } from '../src/templates/cells';
import type { GridConfig } from '@openvtt/canvas';

const square: GridConfig = { type: 'square', size: 50 };

describe('pointInPolygon', () => {
  const quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('classifica pontos internos e externos', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, quad)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, quad)).toBe(false);
    expect(pointInPolygon({ x: -10, y: 50 }, quad)).toBe(false);
    expect(pointInPolygon({ x: 50, y: 150 }, quad)).toBe(false);
  });
});

describe('footprintOf', () => {
  it('circle: contenção radial e bounds quadrados', () => {
    const fp = footprintOf({ shape: 'circle', x: 100, y: 100, distance: 2 }, 50);
    expect(fp.bounds).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect(fp.contains(100, 100)).toBe(true);
    expect(fp.contains(199, 100)).toBe(true);
    expect(fp.contains(201, 100)).toBe(false);
  });

  it('ray: retângulo orientado', () => {
    const fp = footprintOf({ shape: 'ray', x: 0, y: 0, direction: 0, distance: 2, width: 1 }, 50);
    expect(fp.contains(50, 0)).toBe(true);
    expect(fp.contains(50, 40)).toBe(false);
    expect(fp.contains(120, 0)).toBe(false);
    const rotated = footprintOf({ shape: 'ray', x: 0, y: 0, direction: Math.PI / 2, distance: 2, width: 1 }, 50);
    expect(rotated.contains(0, 50)).toBe(true);
    expect(rotated.contains(40, 50)).toBe(false);
  });

  it('cone: setor de 60° a partir do ápice', () => {
    const fp = footprintOf({ shape: 'cone', x: 0, y: 0, direction: 0, distance: 2 }, 50);
    expect(fp.contains(50, 0)).toBe(true);
    expect(fp.contains(50, 60)).toBe(false);
    expect(fp.contains(-20, 0)).toBe(false);
  });
});

describe('affectedCells (grid quadrado)', () => {
  it('circle cobre as 5 células centradas', () => {
    const fp = footprintOf({ shape: 'circle', x: 125, y: 125, distance: 1.1 }, 50);
    const cells = affectedCells(fp, square);
    expect(cells).toHaveLength(5);
    expect(cells).toContainEqual({ x: 125, y: 125 });
    expect(cells).toContainEqual({ x: 75, y: 125 });
    expect(cells).toContainEqual({ x: 175, y: 125 });
    expect(cells).toContainEqual({ x: 125, y: 75 });
    expect(cells).toContainEqual({ x: 125, y: 175 });
  });

  it('ray cobre as células ao longo do eixo, respeitando a largura', () => {
    const fp = footprintOf({ shape: 'ray', x: 0, y: 0, direction: 0, distance: 2, width: 1.1 }, 50);
    const cells = affectedCells(fp, square);
    expect(cells).toContainEqual({ x: 25, y: 25 });
    expect(cells).toContainEqual({ x: 75, y: 25 });
    expect(cells).toContainEqual({ x: 25, y: -25 });
    expect(cells).toContainEqual({ x: 75, y: -25 });
    expect(cells).toHaveLength(4);
  });

  it('cone cobre apenas células dentro do arco e do alcance', () => {
    const fp = footprintOf({ shape: 'cone', x: 30, y: 20, direction: 0, distance: 3 }, 50);
    const cells = affectedCells(fp, square);
    expect(cells).toContainEqual({ x: 75, y: 25 });
    expect(cells).toContainEqual({ x: 125, y: 25 });
    expect(cells).toContainEqual({ x: 175, y: 25 });
    expect(cells).toContainEqual({ x: 125, y: -25 });
    expect(cells).toHaveLength(4);
  });

  it('respeita offsets do grid', () => {
    const shifted: GridConfig = { type: 'square', size: 50, offsetX: 10, offsetY: 10 };
    const fp = footprintOf({ shape: 'circle', x: 135, y: 135, distance: 1.1 }, 50);
    const cells = affectedCells(fp, shifted);
    expect(cells).toContainEqual({ x: 135, y: 135 });
    expect(cells).toHaveLength(5);
  });
});

describe('affectedCells (outros grids)', () => {
  it('hex-vertical: cobre o hexágono central e vizinhos próximos', () => {
    const grid: GridConfig = { type: 'hex-vertical', size: 50 };
    const fp = footprintOf({ shape: 'circle', x: 0, y: 0, distance: 1.5 }, 50);
    const cells = affectedCells(fp, grid);
    expect(cells).toContainEqual({ x: 0, y: 0 });
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('isometric: cobre o losango central e vizinhos próximos', () => {
    const grid: GridConfig = { type: 'isometric', size: 50 };
    const fp = footprintOf({ shape: 'circle', x: 0, y: 0, distance: 1.5 }, 50);
    const cells = affectedCells(fp, grid);
    expect(cells).toContainEqual({ x: 0, y: 0 });
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('grid none: nenhuma célula', () => {
    const fp = footprintOf({ shape: 'circle', x: 0, y: 0, distance: 2 }, 50);
    expect(affectedCells(fp, { type: 'none', size: 50 })).toHaveLength(0);
  });
});
