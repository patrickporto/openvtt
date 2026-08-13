import * as THREE from 'three';

import { heightCanvasToNormalCanvas } from '@openvtt/render3d';
import { createCanvas } from './platform';
import type { DiceShape } from '../constants/dice';

export interface MaterialCacheEntry {
  composite: THREE.Texture;
  bump: THREE.Texture | null;
  emissive: THREE.Texture | null;
  normal?: THREE.Texture | null;
}

const MATERIALS_CACHE_LIMIT = 512;

export class TextureLRUCache {
  #map = new Map<string, MaterialCacheEntry>();
  #limit: number;

  constructor(limit = MATERIALS_CACHE_LIMIT) {
    this.#limit = limit;
  }

  get(key: string): MaterialCacheEntry | undefined {
    const entry = this.#map.get(key);
    if (entry) {
      this.#map.delete(key);
      this.#map.set(key, entry);
    }
    return entry;
  }

  set(key: string, entry: MaterialCacheEntry): void {
    this.#map.delete(key);
    this.#map.set(key, entry);
    while (this.#map.size > this.#limit) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      const entry = this.#map.get(oldest);
      if (entry) this.#disposeEntry(entry);
      this.#map.delete(oldest);
    }
  }

  #disposeEntry(entry: MaterialCacheEntry): void {
    entry.composite.dispose();
    entry.bump?.dispose();
    entry.emissive?.dispose();
    entry.normal?.dispose();
  }

  clear(dispose = false): void {
    if (dispose) {
      this.#map.forEach((entry) => this.#disposeEntry(entry));
    }
    this.#map.clear();
  }

  get size(): number {
    return this.#map.size;
  }
}

export interface FaceTextureSource {
  name?: string;
  composite?: string;
  texture?: CanvasImageSource | CanvasImageSource[];
  bump?: CanvasImageSource | CanvasImageSource[];
  material?: string;
}

export type FaceLabel = string | HTMLImageElement;

export interface PaintFaceOptions {
  shape: DiceShape;
  labels: unknown[];
  index: number;
  size: number;
  margin: number;
  texture: FaceTextureSource;
  forecolor: string;
  outlinecolor: string;
  backcolor: string;
  font: string;
  fontOffsetY: number;
  emissive: boolean;
}

export function calculateTextureSize(approx: number): number {
  return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
}

const FACE_ROTATION: Record<DiceShape, { even?: number; odd?: number; all?: number }> = {
  d2: { all: 0 },
  d4: { all: 0 },
  d6: { all: 0 },
  d8: { even: -7.5, odd: -127.5 },
  d10: { all: -6 },
  d12: { all: 5 },
  d20: { all: -7.5 },
  d100: { all: -6 },
};

export function normalTextureFromHeight(heightCanvas: HTMLCanvasElement, strength = 2): THREE.CanvasTexture {
  return new THREE.CanvasTexture(heightCanvasToNormalCanvas(heightCanvas, strength));
}

export function createNoiseTexture(size = 512, intensity = 0.5): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = '#000';
  context.fillRect(0, 0, size, size);

  const imageData = context.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const val = Math.floor(Math.random() * 255 * intensity + (255 * (1 - intensity)));
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function paintFaceTextures(options: PaintFaceOptions): MaterialCacheEntry | null {
  const {
    shape,
    labels,
    index,
    margin,
    texture,
    forecolor,
    outlinecolor,
    backcolor,
    font,
    fontOffsetY,
    emissive,
  } = options;
  const size = options.size;

  if (labels[index] === undefined) return null;

  const text = labels[index] as FaceLabel | FaceLabel[];

  const { canvas, context } = createCanvas();
  if (!canvas || !context) return null;

  context.globalAlpha = 0;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const { canvas: canvasBump, context: contextBump } = createCanvas();
  if (!canvasBump || !contextBump) return null;

  contextBump.globalAlpha = 0;
  contextBump.clearRect(0, 0, canvasBump.width, canvasBump.height);

  const { canvas: canvasEmissive, context: realEmissiveContext } = createCanvas();
  if (!canvasEmissive || !realEmissiveContext) return null;
  const noopContext = new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D;
  const contextEmissive: CanvasRenderingContext2D = emissive ? realEmissiveContext : noopContext;

  contextEmissive.globalAlpha = 0;
  contextEmissive.clearRect(0, 0, canvasEmissive.width, canvasEmissive.height);

  let ts: number;

  if (shape == 'd4') {
    ts = calculateTextureSize(size + margin) * 4;
  } else {
    ts = calculateTextureSize(size + size * 2 * margin) * 4;
  }

  canvas.width = canvas.height = ts;
  canvasBump.width = canvasBump.height = ts;
  if (emissive) {
    canvasEmissive.width = canvasEmissive.height = ts;
  }

  context.fillStyle = backcolor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  contextBump.fillStyle = '#FFFFFF';
  contextBump.fillRect(0, 0, canvasBump.width, canvasBump.height);

  contextEmissive.fillStyle = '#000000';
  contextEmissive.fillRect(0, 0, canvasEmissive.width, canvasEmissive.height);

  if (texture.texture && texture.name != '' && texture.name != 'none') {
    context.globalCompositeOperation = (texture.composite || 'source-over') as GlobalCompositeOperation;
    context.drawImage(texture.texture as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';

    if (texture.bump) {
      contextBump.globalCompositeOperation = 'source-over';
      contextBump.drawImage(texture.bump as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    }
  } else {
    context.globalCompositeOperation = 'source-over';
  }

  context.globalCompositeOperation = 'source-over';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  contextBump.textAlign = 'center';
  contextBump.textBaseline = 'middle';

  contextEmissive.textAlign = 'center';
  contextEmissive.textBaseline = 'middle';

  let isTexture = false;

  if (shape != 'd4') {
    const rotateface = FACE_ROTATION[shape];

    if (rotateface) {
      let degrees;
      if (rotateface.hasOwnProperty('all')) {
        degrees = rotateface.all;
      } else {
        if (index > 0 && index % 2 != 0) {
          degrees = rotateface.odd;
        } else {
          degrees = rotateface.even;
        }
      }

      if (degrees && degrees != 0) {
        const hw = canvas.width / 2;
        const hh = canvas.height / 2;

        context.translate(hw, hh);
        context.rotate(degrees * (Math.PI / 180));
        context.translate(-hw, -hh);

        contextBump.translate(hw, hh);
        contextBump.rotate(degrees * (Math.PI / 180));
        contextBump.translate(-hw, -hh);

        contextEmissive.translate(hw, hh);
        contextEmissive.rotate(degrees * (Math.PI / 180));
        contextEmissive.translate(-hw, -hh);
      }
    }

    if (text instanceof HTMLImageElement) {
      isTexture = true;
      context.drawImage(
        text,
        0,
        0,
        text.width,
        text.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } else {
      const textString = text as string;
      let fontsize = ts / (1 + 2 * margin);
      let textstarty = canvas.height / 2 + 10 + (fontOffsetY || 0);
      let textstartx = canvas.width / 2;

      if (shape == 'd10') {
        fontsize = fontsize * 0.75;
        textstarty = textstarty * 1.15 - 10;
      } else if (shape == 'd20') {
        textstartx = textstartx * 0.98;
      }

      context.font = fontsize + 'pt ' + font;
      contextBump.font = fontsize + 'pt ' + font;
      contextEmissive.font = fontsize + 'pt ' + font;

      let lineHeight = context.measureText('M').width * 1.4;
      const textlines = textString.split('\n');

      if (textlines.length > 1) {
        fontsize = fontsize / textlines.length;
        context.font = fontsize + 'pt ' + font;
        contextBump.font = fontsize + 'pt ' + font;
        contextEmissive.font = fontsize + 'pt ' + font;
        lineHeight = context.measureText('M').width * 1.2;
        textstarty -= (lineHeight * textlines.length) / 2;
      }

      for (let i = 0, l = textlines.length; i < l; i++) {
        const textline = textlines[i].trim();

        if (outlinecolor != 'none' && outlinecolor != backcolor) {
          context.strokeStyle = outlinecolor;
          context.lineWidth = 5;
          context.strokeText(textlines[i], textstartx, textstarty);

          contextBump.strokeStyle = '#000000';
          contextBump.lineWidth = 5;
          contextBump.strokeText(textlines[i], textstartx, textstarty);

          contextEmissive.strokeStyle = forecolor;
          contextEmissive.lineWidth = 5;
          contextEmissive.strokeText(textlines[i], textstartx, textstarty);

          if (textline == '6' || textline == '9') {
            context.strokeText('  .', textstartx, textstarty);
            contextBump.strokeText('  .', textstartx, textstarty);
            contextEmissive.strokeText('  .', textstartx, textstarty);
          }
        }

        context.fillStyle = forecolor;
        context.fillText(textlines[i], textstartx, textstarty);

        contextBump.fillStyle = '#000000';
        contextBump.fillText(textlines[i], textstartx, textstarty);

        contextEmissive.fillStyle = forecolor;
        contextEmissive.fillText(textlines[i], textstartx, textstarty);

        if (textline == '6' || textline == '9') {
          context.fillText('  .', textstartx, textstarty);
          contextBump.fillText('  .', textstartx, textstarty);
          contextEmissive.fillText('  .', textstartx, textstarty);
        }
        textstarty += lineHeight * 1.5;
      }
    }
  } else {
    const items = text as FaceLabel[];
    const hw = canvas.width / 2;
    const hh = canvas.height / 2;

    context.font = (ts / 128) * 24 + 'pt ' + font;
    contextBump.font = (ts / 128) * 24 + 'pt ' + font;
    contextEmissive.font = (ts / 128) * 24 + 'pt ' + font;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item instanceof HTMLImageElement) {
        const scaleTexture = item.width / canvas.width;
        context.drawImage(
          item,
          0,
          0,
          item.width,
          item.height,
          100 / scaleTexture,
          25 / scaleTexture,
          60 / scaleTexture,
          60 / scaleTexture
        );
      } else {
        const yPos = hh - ts * 0.3 + (fontOffsetY || 0);
        if (outlinecolor != 'none' && outlinecolor != backcolor) {
          context.strokeStyle = outlinecolor;
          context.lineWidth = 5;
          context.strokeText(item, hw, yPos);

          contextBump.strokeStyle = '#000000';
          contextBump.lineWidth = 5;
          contextBump.strokeText(item, hw, yPos);

          contextEmissive.strokeStyle = forecolor;
          contextEmissive.lineWidth = 5;
          contextEmissive.strokeText(item, hw, yPos);
        }

        context.fillStyle = forecolor;
        context.fillText(item, hw, yPos);

        contextBump.fillStyle = '#000000';
        contextBump.fillText(item, hw, yPos);

        contextEmissive.fillStyle = forecolor;
        contextEmissive.fillText(item, hw, yPos);
      }

      context.translate(hw, hh);
      context.rotate((Math.PI * 2) / 3);
      context.translate(-hw, -hh);

      contextBump.translate(hw, hh);
      contextBump.rotate((Math.PI * 2) / 3);
      contextBump.translate(-hw, -hh);

      contextEmissive.translate(hw, hh);
      contextEmissive.rotate((Math.PI * 2) / 3);
      contextEmissive.translate(-hw, -hh);
    }
  }

  const compositetexture = new THREE.CanvasTexture(canvas);
  let bumpMap: THREE.CanvasTexture | null;
  let emissiveMap: THREE.CanvasTexture | null;
  if (!isTexture) {
    bumpMap = new THREE.CanvasTexture(canvasBump);
    emissiveMap = emissive ? new THREE.CanvasTexture(canvasEmissive) : null;
  } else {
    bumpMap = null;
    emissiveMap = null;
  }

  return {
    composite: compositetexture,
    bump: bumpMap,
    emissive: emissiveMap,
  };
}
