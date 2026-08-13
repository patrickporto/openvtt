export interface Vector2D {
  x: number;
  y: number;
}

export interface DisplayConfig {
  currentWidth: number;
  currentHeight: number;
  containerWidth: number;
  containerHeight: number;
  aspect: number;
  scale: number;
}

export interface CameraHeights {
  max: number;
  close: number;
  medium: number;
  far: number;
}

export function createDisplayConfig(): DisplayConfig {
  return {
    currentWidth: 0,
    currentHeight: 0,
    containerWidth: 0,
    containerHeight: 0,
    aspect: 1,
    scale: 1,
  };
}

export function createCameraHeights(): CameraHeights {
  return { max: 0, close: 0, medium: 0, far: 0 };
}
