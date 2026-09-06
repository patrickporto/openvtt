import { describe, expect, it } from 'bun:test';
import { chooseLevel, levelSizeAt, maxLevelFor, tilesAcross } from '../src/tiled/lod';

describe('levelSizeAt', () => {
  it('halves dimensions per level with a 1px floor', () => {
    expect(levelSizeAt(0, 1600, 1000)).toEqual({ width: 1600, height: 1000 });
    expect(levelSizeAt(1, 1600, 1000)).toEqual({ width: 800, height: 500 });
    expect(levelSizeAt(3, 1600, 1000)).toEqual({ width: 200, height: 125 });
    expect(levelSizeAt(8, 10, 3)).toEqual({ width: 1, height: 1 });
  });
});

describe('maxLevelFor', () => {
  it('builds levels until the largest edge fits one tile', () => {
    expect(maxLevelFor(512, 300, 512)).toBe(0);
    expect(maxLevelFor(4096, 4096, 512)).toBe(3);
    expect(maxLevelFor(16000, 9000, 512)).toBe(5);
  });
});

describe('chooseLevel', () => {
  it('picks level 0 when the display needs full resolution', () => {
    expect(chooseLevel(4096, 4096, 1, 3)).toBe(0);
    expect(chooseLevel(4096, 1024, 4, 3)).toBe(0);
  });

  it('picks coarser levels as the zoom decreases', () => {
    expect(chooseLevel(4096, 1024, 1, 3)).toBe(2);
    expect(chooseLevel(4096, 4096, 0.25, 3)).toBe(2);
  });

  it('clamps to the available max level', () => {
    expect(chooseLevel(4096, 4096, 0.05, 3)).toBe(3);
  });

  it('falls back to the coarsest level on degenerate input', () => {
    expect(chooseLevel(4096, 0, 1, 3)).toBe(3);
  });
});

describe('tilesAcross', () => {
  it('rounds partial tiles up with a minimum of one', () => {
    expect(tilesAcross(512, 512)).toBe(1);
    expect(tilesAcross(513, 512)).toBe(2);
    expect(tilesAcross(1024, 512)).toBe(2);
    expect(tilesAcross(1, 512)).toBe(1);
  });
});
