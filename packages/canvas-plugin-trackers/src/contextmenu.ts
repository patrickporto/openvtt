import { MENU_ORDER, menu, menuControls, menuWhen, type ContextMenuContribution, type ContextMenuItem } from '@openvtt/canvas';
import { normalizeTrackerColor } from './color';
import type { MathApplyResult } from './store';
import type { Tracker, TrackerInput, TrackerLabelStyle, TrackerSide } from './schemas';
import type { TrackerPreset } from './presets';

export interface TrackersMenuApi {
  list(tokenId: string): readonly Tracker[];
  get(tokenId: string, trackerId: string): Tracker | undefined;
  upsert(tokenId: string, input: TrackerInput): Tracker;
  patch(tokenId: string, trackerId: string, changes: Partial<TrackerInput>): Tracker | undefined;
  reorder(tokenId: string, trackerId: string, toIndex: number): boolean;
  remove(tokenId: string, trackerId?: string): boolean;
  applyMathInput(tokenId: string, trackerId: string, input: string): MathApplyResult;
  defaults(): readonly Tracker[];
  setDefaults(inputs: readonly TrackerInput[]): readonly Tracker[];
  saveAsDefaults(tokenId: string): boolean;
  applyDefaultsTo(tokenIds: readonly string[]): number;
  presets(): readonly TrackerPreset[];
  readonly autoApplyDefaults: boolean;
  setAutoApplyDefaults(value: boolean): void;
}

const ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 16v3M9 11v8M14 7v12M19 13v6"/></svg>`;
const ADD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;

const SIDES: readonly TrackerSide[] = ['top', 'bottom', 'left', 'right'];
const LABEL_STYLES: readonly { value: TrackerLabelStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'value', label: 'Value' },
  { value: 'max', label: 'Max' },
  { value: 'fraction', label: 'Fraction' },
  { value: 'percent', label: 'Percent' },
];

const TEXT_INPUT_STYLE =
  'flex:1;min-width:70px;width:90px;background:transparent;border:1px solid rgba(255,255,255,.15);border-radius:5px;color:inherit;font:inherit;padding:2px 6px;text-align:right';
const NAME_STYLE = 'flex:1;font-size:11px;font-weight:600;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

function uniqueName(existing: readonly Tracker[], base: string): string {
  const names = new Set(existing.map((t) => t.name));
  if (!names.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} ${i}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

function mathRow(
  name: string,
  current: number,
  onCommit: (input: string) => MathApplyResult,
): Node {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 4px;width:100%';
  const lead = document.createElement('span');
  lead.textContent = name;
  lead.style.cssText = NAME_STYLE;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = String(current);
  input.style.cssText = TEXT_INPUT_STYLE;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      input.blur();
    }
  });
  input.addEventListener('change', () => {
    const result = onCommit(input.value);
    if (result.ok) {
      input.value = '';
      input.style.borderColor = 'rgba(255,255,255,.15)';
      input.placeholder = String(result.value);
    } else {
      input.style.borderColor = 'rgba(229,72,77,.9)';
    }
  });
  wrap.append(lead, input);
  return wrap;
}

function trackerConfigItems(api: TrackersMenuApi, tokenId: string, tracker: Tracker): ContextMenuItem[] {
  const patch = (changes: Partial<TrackerInput>): void => {
    api.patch(tokenId, tracker.id, changes);
  };
  const currentColor = (): ReturnType<typeof normalizeTrackerColor> =>
    normalizeTrackerColor(api.get(tokenId, tracker.id)?.color, tracker.kind);
  const sideActions = SIDES.map((side) =>
    menu.action(`trackers:side:${side}`, side[0].toUpperCase() + side.slice(1), {
      onClick: () => patch({ side }),
    }),
  );
  const labelActions = LABEL_STYLES.map((style) =>
    menu.action(`trackers:label:${style.value}`, style.label, {
      onClick: () => patch({ label: style.value }),
    }),
  );
  const items: ContextMenuItem[] = [
    menu.custom(`trackers:${tracker.id}:math`, () =>
      mathRow(tracker.name, tracker.value, (input) => api.applyMathInput(tokenId, tracker.id, input)),
    ),
    menu.action(`trackers:${tracker.id}:plus`, `+${tracker.step}`, {
      onClick: () => api.applyMathInput(tokenId, tracker.id, `+${tracker.step}`),
    }),
    menu.action(`trackers:${tracker.id}:minus`, `−${tracker.step}`, {
      onClick: () => api.applyMathInput(tokenId, tracker.id, `-${tracker.step}`),
    }),
    menu.toggle(`trackers:${tracker.id}:visible`, 'Displayed', {
      checked: tracker.visible,
      onClick: () => patch({ visible: !tracker.visible }),
    }),
    menu.toggle(`trackers:${tracker.id}:math`, 'Inline math', {
      checked: tracker.math,
      onClick: () => patch({ math: !tracker.math }),
    }),
    menu.toggle(`trackers:${tracker.id}:clamp`, 'Clamp to range', {
      checked: tracker.clamp,
      onClick: () => patch({ clamp: !tracker.clamp }),
    }),
  ];
  if (tracker.kind === 'bar') {
    items.push(
      menu.toggle(`trackers:${tracker.id}:invert`, 'Invert', {
        checked: tracker.invert,
        onClick: () => patch({ invert: !tracker.invert }),
      }),
      menu.toggle(`trackers:${tracker.id}:hideEmpty`, 'Hide when empty', {
        checked: tracker.hideEmpty,
        onClick: () => patch({ hideEmpty: !tracker.hideEmpty }),
      }),
      menu.toggle(`trackers:${tracker.id}:hideFull`, 'Hide when full', {
        checked: tracker.hideFull,
        onClick: () => patch({ hideFull: !tracker.hideFull }),
      }),
      menu.custom(`trackers:${tracker.id}:colormin`, () =>
        menuControls.color({
          label: 'Min',
          value: currentColor().min,
          live: (value) => api.patch(tokenId, tracker.id, { color: { min: value, max: currentColor().max } }),
          commit: (value) => api.patch(tokenId, tracker.id, { color: { min: value, max: currentColor().max } }),
        }),
      ),
      menu.custom(`trackers:${tracker.id}:colormax`, () =>
        menuControls.color({
          label: 'Max',
          value: currentColor().max,
          live: (value) => api.patch(tokenId, tracker.id, { color: { min: currentColor().min, max: value } }),
          commit: (value) => api.patch(tokenId, tracker.id, { color: { min: currentColor().min, max: value } }),
        }),
      ),
    );
  } else {
    items.push(
      menu.custom(`trackers:${tracker.id}:color`, () =>
        menuControls.color({
          label: 'Color',
          value: currentColor().max,
          live: (value) => api.patch(tokenId, tracker.id, { color: value }),
          commit: (value) => api.patch(tokenId, tracker.id, { color: value }),
        }),
      ),
    );
  }
  items.push(
    menu.submenu(`trackers:${tracker.id}:side`, 'Side', sideActions),
    menu.submenu(`trackers:${tracker.id}:inset`, 'Placement', [
      menu.action('trackers:inset:inner', 'Inner', { onClick: () => patch({ inset: 'inner' }) }),
      menu.action('trackers:inset:outer', 'Outer', { onClick: () => patch({ inset: 'outer' }) }),
    ]),
    menu.submenu(`trackers:${tracker.id}:labelstyle`, 'Label', labelActions),
    menu.submenu(`trackers:${tracker.id}:move`, 'Move', [
      menu.action('trackers:move:up', 'Up', { onClick: () => api.reorder(tokenId, tracker.id, currentIndex(api, tokenId, tracker) - 1) }),
      menu.action('trackers:move:down', 'Down', { onClick: () => api.reorder(tokenId, tracker.id, currentIndex(api, tokenId, tracker) + 1) }),
      menu.action('trackers:move:top', 'To top', { onClick: () => api.reorder(tokenId, tracker.id, 0) }),
    ]),
    menu.action(`trackers:${tracker.id}:remove`, 'Remove', {
      icon: TRASH,
      danger: true,
      onClick: () => api.remove(tokenId, tracker.id),
    }),
  );
  return items;
}

function currentIndex(api: TrackersMenuApi, tokenId: string, tracker: Tracker): number {
  return api.list(tokenId).findIndex((t) => t.id === tracker.id);
}

/** Contribuição do menu de seleção de tokens (edição rápida + editor). */
export function trackersSelectionMenu(api: TrackersMenuApi): ContextMenuContribution {
  return {
    id: 'trackers:selection',
    when: menuWhen.selection('token'),
    items: (menuCtx) => {
      const tokenIds = menuCtx.selection
        .filter((obj) => obj.objectType === 'token')
        .map((obj) => obj.id);
      if (tokenIds.length === 0) return [];
      const single = tokenIds.length === 1 ? tokenIds[0] : undefined;
      const trackers = single ? api.list(single) : [];

      const quickRows: ContextMenuItem[] = single
        ? trackers.map((tracker) =>
            menu.custom(`trackers:quick:${tracker.id}`, () =>
              mathRow(tracker.name, tracker.value, (input) => api.applyMathInput(single, tracker.id, input)),
            ),
          )
        : [];

      const configItems: ContextMenuItem[] = single
        ? [
            ...trackers.map((tracker) =>
              menu.submenu(`trackers:cfg:${tracker.id}`, tracker.name, trackerConfigItems(api, single, tracker)),
            ),
            menu.action('trackers:add', 'Add tracker', {
              icon: ADD,
              onClick: () => api.upsert(single, { name: uniqueName(api.list(single), 'New tracker') }),
            }),
            menu.action('trackers:clear', 'Clear all', {
              icon: TRASH,
              danger: true,
              disabled: trackers.length === 0,
              onClick: () => api.remove(single),
            }),
            menu.action('trackers:save-defaults', 'Save as scene defaults', {
              disabled: trackers.length === 0,
              onClick: () => api.saveAsDefaults(single),
            }),
          ]
        : [];

      return [
        menu.submenu(
          'trackers:menu',
          'Trackers',
          [
            ...quickRows,
            ...(configItems.length > 0
              ? [menu.submenu('trackers:configure', 'Configure', configItems)]
              : []),
            menu.action(
              'trackers:apply-defaults',
              api.defaults().length > 0
                ? `Apply scene defaults${tokenIds.length > 1 ? ` (${tokenIds.length} tokens)` : ''}`
                : 'Apply scene defaults (none set)',
              {
                disabled: api.defaults().length === 0,
                onClick: () => api.applyDefaultsTo(tokenIds),
              },
            ),
          ],
          { icon: ICON, order: MENU_ORDER.edit + 40 },
        ),
      ];
    },
  };
}

/** Contribuição do menu do canvas (defaults de cena, presets, auto-apply). */
export function trackersSceneMenu(api: TrackersMenuApi): ContextMenuContribution {
  return {
    id: 'trackers:scene',
    when: menuWhen.canvas(),
    items: () => {
      const defaults = api.defaults();
      const defaultItems: ContextMenuItem[] = defaults.map((tracker) =>
        menu.action(`trackers:def:${tracker.id}:remove`, `Remove ${tracker.name}`, {
          icon: TRASH,
          danger: true,
          onClick: () => api.setDefaults(defaults.filter((t) => t.id !== tracker.id)),
        }),
      );
      const presetItems: ContextMenuItem[] = api.presets().map((preset) =>
        menu.action(`trackers:preset:${preset.id}`, preset.name, {
          onClick: () => api.setDefaults(preset.trackers),
        }),
      );
      return [
        menu.submenu(
          'trackers:scene-menu',
          'Trackers',
          [
            menu.submenu('trackers:defaults', `Scene defaults (${defaults.length})`, defaultItems, {
              disabled: defaults.length === 0,
            }),
            menu.submenu('trackers:presets', 'Use preset as defaults', presetItems),
            menu.toggle('trackers:auto-apply', 'Apply defaults to new tokens', {
              checked: api.autoApplyDefaults,
              onClick: () => api.setAutoApplyDefaults(!api.autoApplyDefaults),
            }),
          ],
          { icon: ICON, order: MENU_ORDER.canvas + 40 },
        ),
      ];
    },
  };
}
