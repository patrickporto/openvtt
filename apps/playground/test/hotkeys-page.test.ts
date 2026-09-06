import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { hotkeys } from '../src/hotkeys';
import { renderHotkeys } from '../src/pages/hotkeys';

describe('Hotkeys Lab page', () => {
  let cleanup: () => void;

  beforeAll(() => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanup = renderHotkeys(root);
  });

  afterAll(() => {
    cleanup();
  });

  it('registers the demo actions on mount', () => {
    expect(hotkeys.getAction('playground', 'demo:log')?.binds.map((b) => b.key)).toEqual(['h']);
    expect(hotkeys.getAction('playground', 'demo:konami')?.binds.map((b) => b.key)).toEqual(['k']);
    expect(hotkeys.getAction('playground', 'demo:hold')?.repeat).toBe(true);
  });

  it('dispatches registered combos and logs them', () => {
    const handled = hotkeys.handle(
      { code: 'KeyH', key: 'h', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
      'down',
    );
    expect(handled).toBe(true);
    expect(document.querySelector('.hk-log')!.textContent).toContain('hello from H');
  });

  it('scopes the context action behind the toggle', () => {
    const f6 = () =>
      hotkeys.handle(
        { code: 'F6', key: 'F6', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
        'down',
      );
    expect(f6()).toBe(false);
    hotkeys.activateContext('demo');
    expect(f6()).toBe(true);
    hotkeys.deactivateContext('demo');
  });

  it('vetoes the veto demo action when the toggle is on', () => {
    const shiftX = () =>
      hotkeys.handle(
        { code: 'KeyX', key: 'X', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false },
        'down',
      );
    expect(shiftX()).toBe(true);

    (document.querySelector('#hk-veto') as HTMLInputElement).checked = true;
    document.querySelector('#hk-veto')!.dispatchEvent(new Event('change'));
    expect(shiftX()).toBe(false);

    (document.querySelector('#hk-veto') as HTMLInputElement).checked = false;
    document.querySelector('#hk-veto')!.dispatchEvent(new Event('change'));
    expect(shiftX()).toBe(true);
  });

  it('lists actions and unregisters them on cleanup', () => {
    expect(document.querySelectorAll('.hk-action').length).toBeGreaterThanOrEqual(6);
    cleanup();
    cleanup = () => {};
    expect(hotkeys.getAction('playground', 'demo:log')).toBeUndefined();
  });
});
