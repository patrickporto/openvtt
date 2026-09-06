import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { ContextMenuCloseReason, ContextMenuContext } from '../src/contextmenu/types';

GlobalRegistrator.register();

const { defineCanvasElements } = await import('../src/ui');
const { CONTEXT_MENU_TAG, OpenVTTContextMenu } = await import('../src/ui/context-menu');
const { menu } = await import('../src/contextmenu/builders');

function menuCtx(): ContextMenuContext {
  return {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    target: { type: 'canvas' },
    selection: [],
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

describe('OpenVTTContextMenu (DOM)', () => {
  let host: HTMLElement;

  beforeAll(() => {
    defineCanvasElements();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  function openMenu(
    items: Parameters<OpenVTTContextMenu['open']>[0]['items'],
    onClose: (reason: ContextMenuCloseReason) => void = () => {},
  ): OpenVTTContextMenu {
    const el = document.createElement(CONTEXT_MENU_TAG) as OpenVTTContextMenu;
    host.appendChild(el);
    el.open({ items, x: 10, y: 10, context: menuCtx(), onClose });
    return el;
  }

  it('flips the toggle check icon without mutating the item', () => {
    let closed = false;
    const item = menu.toggle('p:t', 'T', { checked: false, onClick: () => {} });
    const el = openMenu([item], () => {
      closed = true;
    });
    const row = el.shadowRoot!.querySelector('.item')!;
    expect(row.querySelector('.check')!.innerHTML).toBe('');
    row.click();
    expect(row.querySelector('.check')!.innerHTML).not.toBe('');
    row.click();
    expect(row.querySelector('.check')!.innerHTML).toBe('');
    expect(item.checked).toBe(false);
    expect(Object.isFrozen(item)).toBe(true);
    expect(closed).toBe(false);
    el.close();
  });

  it('keeps the menu open and the icon unchanged when onClick throws', () => {
    const item = menu.toggle('p:t', 'T', {
      checked: false,
      onClick: () => {
        throw new Error('boom');
      },
    });
    const el = openMenu([item], () => {
      throw new Error('should not close');
    });
    const row = el.shadowRoot!.querySelector('.item')!;
    row.click();
    expect(row.querySelector('.check')!.innerHTML).toBe('');
    el.close();
  });

  it('closes with reason action when an action is clicked', () => {
    const reasons: ContextMenuCloseReason[] = [];
    const item = menu.action('p:a', 'A', { onClick: () => {} });
    const el = openMenu([item], (reason) => reasons.push(reason));
    el.shadowRoot!.querySelector('.item')!.click();
    expect(reasons).toEqual(['action']);
  });

  it('opens submenu flyouts and activates nested children', () => {
    const reasons: ContextMenuCloseReason[] = [];
    const child = menu.action('p:child', 'Child', { onClick: () => {} });
    const parent = menu.submenu('p:parent', 'Parent', [child]);
    const el = openMenu([parent], (reason) => reasons.push(reason));
    const rootMenu = el.shadowRoot!.querySelector('.menu')!;
    expect(el.shadowRoot!.querySelectorAll('.menu')).toHaveLength(1);
    rootMenu.querySelector('.item')!.click();
    const menus = el.shadowRoot!.querySelectorAll('.menu');
    expect(menus).toHaveLength(2);
    menus[1].querySelector('.item')!.click();
    expect(reasons).toEqual(['action']);
  });

  it('resets toggle overrides across open sessions', () => {
    const item = menu.toggle('p:t', 'T', { checked: false, onClick: () => {} });
    const el = openMenu([item], () => {});
    el.shadowRoot!.querySelector('.item')!.click();
    el.close();
    el.open({ items: [item], x: 0, y: 0, context: menuCtx(), onClose: () => {} });
    expect(el.shadowRoot!.querySelector('.item .check')!.innerHTML).toBe('');
    el.close();
  });

  it('renders an indeterminate dash that becomes a check on activate', () => {
    const item = menu.toggle('p:t', 'T', { checked: false, indeterminate: true, onClick: () => {} });
    const el = openMenu([item], () => {});
    const row = el.shadowRoot!.querySelector('.item')!;
    const check = row.querySelector('.check')!;
    expect(check.innerHTML).toContain('M6 12h12');
    row.click();
    expect(check.innerHTML).not.toContain('M6 12h12');
    expect(check.innerHTML).not.toBe('');
    el.close();
  });

  it('contains custom render errors', () => {
    const item = menu.custom('p:c', () => {
      throw new Error('boom');
    });
    const el = openMenu([item], () => {});
    expect(el.shadowRoot!.querySelector('.custom')).not.toBeNull();
    el.close();
  });
});
