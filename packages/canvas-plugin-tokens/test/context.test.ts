import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

type Canvas = import('@openvtt/canvas').Canvas;
type HistoryManager = import('@openvtt/canvas').HistoryManager;
type ContextMenuItem = import('@openvtt/canvas').ContextMenuItem;
type ContextMenuToggle = import('@openvtt/canvas').ContextMenuToggle;
type ContextMenuContext = import('@openvtt/canvas').ContextMenuContext;
type Token = import('../src/placeables/Token').Token;

let canvas: Canvas;
let tokensPlugin: import('../src/plugin').TokensPlugin;

beforeAll(async () => {
  const { Canvas: CanvasCtor, HistoryManager: HistoryManagerCtor } = await import('@openvtt/canvas');
  const { TokensPlugin: Plugin } = await import('../src/plugin');
  canvas = new CanvasCtor({} as HTMLElement);
  tokensPlugin = new Plugin();
  await canvas.use(tokensPlugin);
  (canvas as unknown as { history: HistoryManager }).history = new HistoryManagerCtor(canvas);
});

afterAll(() => {
  canvas?.destroy();
});

function collect(): ContextMenuItem[] {
  const context = {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    target: { type: 'canvas' },
    selection: canvas.selected,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as ContextMenuContext;
  return canvas.contextMenu.collect(context);
}

function findItem(items: ContextMenuItem[], id: string): ContextMenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.type === 'action' && item.submenu) {
      const nested = findItem([...item.submenu], id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function hiddenToggle(): ContextMenuToggle | undefined {
  return findItem(collect(), 'tokens:hidden') as ContextMenuToggle | undefined;
}

describe('tokens:hidden toggle in multi-selection', () => {
  it('is indeterminate when states diverge and clicking hides all', async () => {
    const a = (await canvas.documents.create('token', { x: 0, y: 0 })) as Token;
    const b = (await canvas.documents.create('token', { x: 100, y: 0 })) as Token;
    canvas.documents.update('token', a.id, { hidden: true });
    canvas.select(a, false);
    canvas.select(b, true);

    const toggle = hiddenToggle();
    expect(toggle).toBeDefined();
    expect(toggle!.checked).toBe(false);
    expect(toggle!.indeterminate).toBe(true);
    toggle!.onClick?.({} as ContextMenuContext);
    expect((a.document as { hidden?: boolean }).hidden).toBe(true);
    expect((b.document as { hidden?: boolean }).hidden).toBe(true);

    const afterHide = hiddenToggle();
    expect(afterHide!.checked).toBe(true);
    expect(afterHide!.indeterminate).toBe(false);
    afterHide!.onClick?.({} as ContextMenuContext);
    expect((a.document as { hidden?: boolean }).hidden).toBe(false);
    expect((b.document as { hidden?: boolean }).hidden).toBe(false);

    canvas.clearSelection();
    canvas.documents.delete('token', a.id);
    canvas.documents.delete('token', b.id);
  });

  it('stays clean when all tokens share the state', async () => {
    const a = (await canvas.documents.create('token', { x: 0, y: 0 })) as Token;
    canvas.select(a, false);
    const toggle = hiddenToggle();
    expect(toggle!.indeterminate).toBe(false);
    expect(toggle!.checked).toBe(false);
    canvas.clearSelection();
    canvas.documents.delete('token', a.id);
  });
});
