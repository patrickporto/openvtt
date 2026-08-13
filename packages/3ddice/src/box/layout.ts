import * as THREE from 'three';

import { POSITION } from '../constants/position';
import { debounce } from '../utils';
import {
  createCameraHeights,
  createDisplayConfig,
  type CameraHeights,
  type DisplayConfig,
} from './types';

export interface LayoutControllerDeps {
  container: HTMLDivElement;
  onLayout: () => void;
}

export class LayoutController {
  readonly display: DisplayConfig = createDisplayConfig();
  readonly cameraHeight: CameraHeights = createCameraHeights();

  #dimensions: THREE.Vector2;
  #resizeHandler?: ReturnType<typeof debounce>;

  constructor(private deps: LayoutControllerDeps) {
    this.#dimensions = new THREE.Vector2(
      deps.container.clientWidth,
      deps.container.clientHeight
    );
  }

  get dimensions(): THREE.Vector2 {
    return this.#dimensions;
  }

  setDimensions(dimensions?: THREE.Vector2): void {
    const { container } = this.deps;

    this.display.currentWidth = container.clientWidth / 2;
    this.display.currentHeight = container.clientHeight / 2;
    if (dimensions) {
      this.display.containerWidth = dimensions.x;
      this.display.containerHeight = dimensions.y;
    } else {
      this.display.containerWidth = this.display.currentWidth;
      this.display.containerHeight = this.display.currentHeight;
    }
    this.display.aspect = Math.min(
      this.display.currentWidth / this.display.containerWidth,
      this.display.currentHeight / this.display.containerHeight
    );
    if (this.display.aspect) {
      this.display.scale =
        Math.sqrt(
          this.display.containerWidth * this.display.containerWidth +
          this.display.containerHeight * this.display.containerHeight
        ) / 13;
    }

    this.cameraHeight.max =
      this.display.currentHeight / this.display.aspect / POSITION.CAMERA_TAN_ANGLE;
    this.cameraHeight.medium = this.cameraHeight.max / POSITION.MEDIUM_DIVIDER;
    this.cameraHeight.far = this.cameraHeight.max;
    this.cameraHeight.close = this.cameraHeight.max / POSITION.CLOSE_DIVIDER;

    this.deps.onLayout();
  }

  startResizeWatcher(): void {
    const { container } = this.deps;
    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      this.setDimensions(new THREE.Vector2(width, height));
    };

    this.#resizeHandler = debounce(resize);
    window.addEventListener('resize', this.#resizeHandler);
  }

  stopResizeWatcher(): void {
    if (this.#resizeHandler) {
      this.#resizeHandler.cancel?.();
      window.removeEventListener('resize', this.#resizeHandler);
      this.#resizeHandler = undefined;
    }
  }
}
