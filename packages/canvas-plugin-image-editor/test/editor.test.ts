import { describe, expect, it } from 'bun:test';
import { ImageEditor } from '../src/editor';
import { MaskRegistry, polygonMask } from '../src/masks';
import { ImageComposer, DEFAULT_SETTINGS } from '../src/composer';

function fakeImage(w = 200, h = 300): HTMLImageElement {
  return { naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement;
}

function fakeComposer(): { composer: ImageComposer; calls: string[] } {
  const calls: string[] = [];
  const factory = {
    create(width: number, height: number) {
      calls.push(`create:${width}x${height}`);
      const ctx = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === 'canvas') return { toDataURL: (format: string) => `data:${format}` };
          return (...args: unknown[]) => { calls.push(`${prop}:${JSON.stringify(args.map(round))}`); };
        },
      }) as unknown as CanvasRenderingContext2D;
      return { canvas: { toDataURL: (format: string) => `data:${format}` }, ctx };
    },
  };
  return { composer: new ImageComposer(factory, new MaskRegistry([polygonMask('circle', 'Circle', circlePoly())])), calls };
}

function round(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  return value;
}

function circlePoly(): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    points.push([0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5]);
  }
  return points;
}

function makeEditor(composer: ImageComposer) {
  return new ImageEditor({
    composer,
    loadImage: async (src) => fakeImage(200, 300),
  });
}

describe('ImageEditor (headless)', () => {
  it('starts empty with default state', () => {
    const { composer } = fakeComposer();
    const editor = makeEditor(composer);
    expect(editor.state.hasSource).toBe(false);
    expect(editor.state.settings.size).toBe(DEFAULT_SETTINGS.size);
    expect(editor.transform).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0, flipX: false });
  });

  it('loads a source and resets the transform', async () => {
    const { composer } = fakeComposer();
    const editor = makeEditor(composer);
    editor.setTransform({ zoom: 3, x: 0.5 });
    await editor.loadFromUrl('data:image/png;base64,xyz');
    expect(editor.state.hasSource).toBe(true);
    expect(editor.state.sourceUrl).toBe('data:image/png;base64,xyz');
    expect(editor.transform.zoom).toBe(1);
  });

  it('notifies subscribers on every mutation', async () => {
    const { composer } = fakeComposer();
    const editor = makeEditor(composer);
    let notified = 0;
    const unsub = editor.subscribe(() => { notified += 1; });
    editor.setTransform({ zoom: 2 });
    editor.toggleFlip();
    await editor.loadFromUrl('data:image/png;base64,abc');
    editor.clearSource();
    unsub();
    editor.setTransform({ zoom: 1 });
    expect(notified).toBe(4);
  });

  it('clamps zoom and exposes helpers for crop', () => {
    const { composer } = fakeComposer();
    const editor = makeEditor(composer);
    editor.setTransform({ zoom: 999 });
    expect(editor.transform.zoom).toBe(20);
    editor.panBy(24, -12, 240);
    expect(editor.transform.x).toBeCloseTo(0.1);
    expect(editor.transform.y).toBeCloseTo(-0.05);
    editor.rotateBy(Math.PI / 2);
    expect(editor.transform.rotation).toBeCloseTo(Math.PI / 2);
    editor.toggleFlip();
    expect(editor.transform.flipX).toBe(true);
    editor.resetTransform();
    expect(editor.transform).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0, flipX: false });
  });

  it('merges settings shallowly (ring preserved)', () => {
    const { composer } = fakeComposer();
    const editor = makeEditor(composer);
    editor.setSettings({ size: 512 });
    expect(editor.settings.size).toBe(512);
    expect(editor.settings.ring.width).toBe(DEFAULT_SETTINGS.ring.width);
    editor.setSettings({ ring: { color: '#ff0000', width: 8, style: 'gradient' } });
    expect(editor.settings.ring.color).toBe('#ff0000');
    expect(editor.settings.ring.width).toBe(8);
  });

  it('exports dataURL through the composer pipeline', async () => {
    const { composer, calls } = fakeComposer();
    const editor = makeEditor(composer);
    expect(editor.exportDataURL()).toBeNull();
    await editor.loadFromUrl('data:image/png;base64,xyz');
    const url = editor.exportDataURL();
    expect(url).toBe(`data:${DEFAULT_SETTINGS.format}`);
    expect(calls[0]).toBe(`create:${DEFAULT_SETTINGS.size}x${DEFAULT_SETTINGS.size}`);
    expect(calls.some((c) => c.startsWith('clip:'))).toBe(true);
    expect(calls.some((c) => c.startsWith('drawImage:'))).toBe(true);
    expect(calls.some((c) => c.startsWith('stroke:'))).toBe(true);
  });

  it('composeSource honors the current transform', async () => {
    const { composer, calls } = fakeComposer();
    const editor = makeEditor(composer);
    await editor.loadFromUrl('data:image/png;base64,xyz');
    editor.setTransform({ zoom: 2, flipX: true });
    editor.composeSource({ width: 100, height: 100, draw: () => undefined });
    expect(calls.find((c) => c.startsWith('scale:'))).toBe('scale:[-8,8]');
  });
});
