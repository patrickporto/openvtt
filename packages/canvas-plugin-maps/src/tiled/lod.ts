export interface LevelSize {
  width: number;
  height: number;
}

export function levelSizeAt(level: number, baseWidth: number, baseHeight: number): LevelSize {
  const divisor = 2 ** level;
  return {
    width: Math.max(1, Math.ceil(baseWidth / divisor)),
    height: Math.max(1, Math.ceil(baseHeight / divisor)),
  };
}

export function maxLevelFor(baseWidth: number, baseHeight: number, tileSize: number): number {
  const largest = Math.max(baseWidth, baseHeight);
  if (largest <= tileSize) return 0;
  return Math.ceil(Math.log2(largest / tileSize));
}

export function tilesAcross(pixels: number, tileSize: number): number {
  return Math.max(1, Math.ceil(pixels / tileSize));
}

export function chooseLevel(baseWidth: number, displayWidth: number, scale: number, maxLevel: number): number {
  const targetPixels = displayWidth * scale;
  if (targetPixels <= 0 || baseWidth <= 0) return maxLevel;
  if (baseWidth <= targetPixels) return 0;
  const level = Math.round(Math.log2(baseWidth / targetPixels));
  return Math.min(maxLevel, Math.max(0, level));
}

export function clampIndex(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}
