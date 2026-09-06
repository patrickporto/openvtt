import './globals';
import { installDocumentFake, removeDocumentFake } from './globals';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas, ContextMenuContribution, ContextMenuContext, ContextMenuItem, ResizeRect, TransformAdapter } from '@openvtt/canvas';
import { templatesPlugin } from '../src/plugin';
import { registerTemplatesContextMenu } from '../src/context';
import type { TemplateData } from '../src/schemas';

let CanvasCtor: typeof Canvas;
let dynamicBusMod: typeof import('@openvtt/canvas');
let canvas: Canvas;
let adapter: TransformAdapter<TemplateData>;

beforeAll(async () => {
  installDocumentFake();
  dynamicBusMod = await import('@openvtt/canvas');
  ({ Canvas: CanvasCtor } = dynamicBusMod);

  canvas = new CanvasCtor({} as HTMLElement);
  await canvas.use(templatesPlugin);
  adapter = canvas.documents.definition('template')!.transform! as TransformAdapter<TemplateData>;
});

afterAll(() => {
  canvas?.destroy();
  removeDocumentFake();
});

async function createTemplate(data: Partial<TemplateData> & Pick<TemplateData, 'shape' | 'x' | 'y' | 'distance'>) {
  return canvas.documents.create<TemplateData>('template', data);
}

function menuCtx(selection: unknown[]): ContextMenuContext {
  return {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    target: { type: 'canvas' },
    selection: selection as never,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

describe('templates: registro de transform', () => {
  it('declara adapter com rotationField "direction"', () => {
    expect(adapter).toBeDefined();
    expect(adapter.rotationField).toBe('direction');
  });

  it('template selecionado expõe handles de resize e rotação', async () => {
    const circle = await createTemplate({ shape: 'circle', x: 300, y: 300, distance: 2 });
    canvas.select(circle, false);
    expect(canvas.handles.transformable).toBe(true);
    const handles = canvas.handles.coreHandles();
    expect(handles.filter((h) => h.info.type === 'resize')).toHaveLength(4);
    expect(handles.filter((h) => h.info.type === 'rotate')).toHaveLength(1);
    canvas.clearSelection();
    canvas.documents.delete('template', circle.id);
  });
});

describe('templates: applyResize', () => {
  it('circle: dobra a distância a partir do retângulo 2x e é idempotente', async () => {
    const circle = await createTemplate({ shape: 'circle', x: 300, y: 300, distance: 2 });
    expect(circle.getAABB()).toEqual({ minX: 200, minY: 200, maxX: 400, maxY: 400 });

    const rect: ResizeRect = { x: 200, y: 200, width: 400, height: 400 };
    circle.update(adapter.applyResize(circle, rect)!);
    expect(circle.document.distance).toBeCloseTo(4);
    expect(circle.document.x).toBeCloseTo(400);
    expect(circle.document.y).toBeCloseTo(400);

    const again = adapter.applyResize(circle, rect)!;
    expect(again.distance).toBeCloseTo(4);
    canvas.documents.delete('template', circle.id);
  });

  it('ray: escala distance e width juntos preservando a proporção', async () => {
    const ray = await createTemplate({ shape: 'ray', x: 300, y: 300, direction: 0, distance: 4, width: 2 });
    expect(ray.getAABB()).toEqual({ minX: 300, minY: 250, maxX: 500, maxY: 350 });

    const rect: ResizeRect = { x: 300, y: 250, width: 400, height: 200 };
    ray.update(adapter.applyResize(ray, rect)!);
    expect(ray.document.distance).toBeCloseTo(8);
    expect(ray.document.width).toBeCloseTo(4);

    const aabb = ray.getAABB();
    expect(aabb.maxX - aabb.minX).toBeCloseTo(400, 0);
    expect(aabb.maxY - aabb.minY).toBeCloseTo(200, 0);
    canvas.documents.delete('template', ray.id);
  });

  it('cone: mantém o ápice na posição proporcional do retângulo', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 2, distance: 2 });
    expect(cone.getAABB().minX).toBeCloseTo(250);

    const rect: ResizeRect = { x: 250, y: 300, width: 200, height: 200 };
    cone.update(adapter.applyResize(cone, rect)!);
    expect(cone.document.distance).toBeCloseTo(4);
    expect(cone.document.x).toBeCloseTo(350);
    expect(cone.document.y).toBeCloseTo(300);
    canvas.documents.delete('template', cone.id);
  });

  it('clamp respeita o mínimo de 0.5 do schema', async () => {
    const circle = await createTemplate({ shape: 'circle', x: 300, y: 300, distance: 2 });
    const rect: ResizeRect = { x: 290, y: 290, width: 10, height: 10 };
    circle.update(adapter.applyResize(circle, rect)!);
    expect(circle.document.distance).toBe(0.5);
    canvas.documents.delete('template', circle.id);
  });
});

describe('templates: rotação via rotationField', () => {
  it('update com direction redesenha a geometria (caminho do SelectRotating)', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 350, y: 300, direction: Math.PI / 2, distance: 4 });
    const before = adapter.snapshotFields(cone);
    expect(before.direction).toBeCloseTo(Math.PI / 2);

    const field = adapter.rotationField!;
    cone.update({ x: cone.x, y: cone.y, [field]: Number(before.direction) + Math.PI / 2 } as Partial<TemplateData>);
    expect(cone.document.direction).toBeCloseTo(Math.PI);

    const aabb = cone.getAABB();
    expect(aabb.minX).toBeCloseTo(150);
    expect(aabb.maxX).toBeCloseTo(350);
    canvas.documents.delete('template', cone.id);
  });

  it('commit via documents.update persiste direction e emite template:update', async () => {
    const ray = await createTemplate({ shape: 'ray', x: 300, y: 300, direction: 0, distance: 4, width: 2 });
    const updates: Array<Record<string, unknown>> = [];
    const port = dynamicBusMod.dynamicBus(canvas.bus);
    const unsub = port.on('template:update', (p: Record<string, unknown>) => updates.push(p));

    canvas.documents.update('template', ray.id, { direction: Math.PI }, { before: { direction: 0 } });
    expect(ray.document.direction).toBeCloseTo(Math.PI);
    expect(updates.at(-1)?.direction).toBeCloseTo(Math.PI);

    unsub();
    canvas.documents.delete('template', ray.id);
  });
});

describe('templates: pivo de rotação na origem', () => {
  it('adapter declara rotationPivot na posição do documento (ponta)', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 2, distance: 2 });
    expect(adapter.rotationPivot).toBeDefined();
    expect(adapter.rotationPivot!(cone)).toEqual({ x: 300, y: 300 });

    cone.update({ x: 350, y: 250 } as Partial<TemplateData>);
    expect(adapter.rotationPivot!(cone)).toEqual({ x: 350, y: 250 });
    canvas.documents.delete('template', cone.id);
  });

  it('seleção única gira em torno da ponta, não do centro do AABB', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 2, distance: 2 });
    canvas.select(cone, false);

    const center = canvas.handles.getRotationCenter()!;
    expect(center).toEqual({ x: 300, y: 300 });

    const aabb = cone.getAABB();
    expect(center.y).not.toBeCloseTo((aabb.minY + aabb.maxY) / 2);
    canvas.clearSelection();
    canvas.documents.delete('template', cone.id);
  });

  it('seleção múltipla cai para o centro do AABB combinado', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 2, distance: 2 });
    const circle = await createTemplate({ shape: 'circle', x: 500, y: 500, distance: 2 });
    canvas.select(cone, false);
    canvas.select(circle, true);

    const center = canvas.handles.getRotationCenter()!;
    expect(center).toEqual({ x: (250 + 600) / 2, y: (300 + 600) / 2 });
    canvas.clearSelection();
    canvas.documents.delete('template', cone.id);
    canvas.documents.delete('template', circle.id);
  });
});

describe('templates: frame de seleção orientado', () => {
  it('cone girado: frame apertado girado pelo direction, não o AABB', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 4, distance: 2 });
    const frame = cone.getSelectionFrame();
    expect(frame.angle).toBeCloseTo(Math.PI / 4);
    expect(frame.width).toBeCloseTo(100);
    expect(frame.height).toBeCloseTo(100);
    expect(frame.cx).toBeCloseTo(300 + 50 * Math.cos(Math.PI / 4));
    expect(frame.cy).toBeCloseTo(300 + 50 * Math.sin(Math.PI / 4));
    canvas.documents.delete('template', cone.id);
  });

  it('ray girado: frame segue o eixo do raio', async () => {
    const ray = await createTemplate({ shape: 'ray', x: 300, y: 300, direction: Math.PI / 2, distance: 4, width: 2 });
    const frame = ray.getSelectionFrame();
    expect(frame.angle).toBeCloseTo(Math.PI / 2);
    expect(frame.width).toBeCloseTo(200);
    expect(frame.height).toBeCloseTo(100);
    expect(frame.cx).toBeCloseTo(300);
    expect(frame.cy).toBeCloseTo(400);
    canvas.documents.delete('template', ray.id);
  });

  it('círculo: frame neutro (ângulo 0) centrado no documento', async () => {
    const circle = await createTemplate({ shape: 'circle', x: 400, y: 400, distance: 3 });
    const frame = circle.getSelectionFrame();
    expect(frame).toEqual({ cx: 400, cy: 400, width: 300, height: 300, angle: 0 });
    canvas.documents.delete('template', circle.id);
  });

  it('handles acompanham o frame girado do cone', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 4, distance: 2 });
    canvas.select(cone, false);
    const handles = canvas.handles.coreHandles();
    const corners = handles.filter((h) => h.info.type === 'resize');
    expect(corners).toHaveLength(4);

    const frame = cone.getSelectionFrame();
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    const tl = corners.find((h) => h.info.type === 'resize' && h.info.corner === 'tl')!;
    expect(tl.x).toBeCloseTo(frame.cx + (-50) * cos - (-50) * sin);
    expect(tl.y).toBeCloseTo(frame.cy + (-50) * sin + (-50) * cos);

    const rotate = handles.find((h) => h.info.type === 'rotate')!;
    const expectedX = frame.cx + (50 + 26) * sin;
    const expectedY = frame.cy - (50 + 26) * cos;
    expect(rotate.x).toBeCloseTo(expectedX);
    expect(rotate.y).toBeCloseTo(expectedY);
    canvas.clearSelection();
    canvas.documents.delete('template', cone.id);
  });

  it('seleção múltipla: frame null e handles caem no AABB combinado', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: Math.PI / 4, distance: 2 });
    const circle = await createTemplate({ shape: 'circle', x: 500, y: 500, distance: 2 });
    canvas.select(cone, false);
    canvas.select(circle, true);

    expect(canvas.handles.selectionFrame).toBeNull();
    const aabb = canvas.handles.getAABB()!;
    const rotate = canvas.handles.coreHandles().find((h) => h.info.type === 'rotate')!;
    expect(rotate.x).toBeCloseTo((aabb.minX + aabb.maxX) / 2);
    expect(rotate.y).toBeCloseTo(aabb.minY - 26);
    canvas.clearSelection();
    canvas.documents.delete('template', cone.id);
    canvas.documents.delete('template', circle.id);
  });
});

describe('templates: context menu de direction', () => {
  const contributions: ContextMenuContribution[] = [];

  beforeAll(() => {
    registerTemplatesContextMenu({ registerContextMenu: (c) => contributions.push(c) } as never);
  });

  function itemsFor(selection: unknown[]): ContextMenuItem[] {
    const items = contributions[0].items;
    return typeof items === 'function' ? items(menuCtx(selection)) : items;
  }

  it('expõe slider de direction para cone/ray e oculta para circle', async () => {
    const cone = await createTemplate({ shape: 'cone', x: 300, y: 300, direction: 0, distance: 2 });
    const circle = await createTemplate({ shape: 'circle', x: 300, y: 300, distance: 2 });

    const coneDirection = itemsFor([cone]).find((i) => i.id === 'templates:direction');
    expect(coneDirection).toBeDefined();
    expect(coneDirection?.when?.(menuCtx([cone]))).toBe(true);

    const circleDirection = itemsFor([circle]).find((i) => i.id === 'templates:direction');
    expect(circleDirection?.when?.(menuCtx([circle]))).toBe(false);

    canvas.documents.delete('template', cone.id);
    canvas.documents.delete('template', circle.id);
  });
});
