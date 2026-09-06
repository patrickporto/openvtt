import {
  Canvas,
  MENU_ORDER,
  defineCanvasElements,
  definePlugin,
  dynamicBus,
  menu,
  menuWhen,
  newId,
  LAYER_PANEL_TAG,
  type CanvasPlugin,
  type OpenVTTLayerPanel,
  type SceneDataInput,
  type GridType,
} from '@openvtt/canvas';
import { hotkeys } from '../hotkeys';
import { standardPlugins } from '@openvtt/canvas-preset-standard';
import { RingsPlugin, ringsBus } from '@openvtt/canvas-plugin-rings';
import { chainSegments, ellipsePoints, rectPoints, type WallSegmentDataInput } from '@openvtt/canvas-plugin-walls';
import type { WindowsPlugin, WindowManager } from '@openvtt/canvas-plugin-window';
import { RangesPlugin } from '@openvtt/canvas-plugin-ranges';
import { MEASURE_METRIC_PRESETS, type MeasurePlugin } from '@openvtt/canvas-plugin-measure';
import { DND5E_COMBAT, TrackersPlugin, trackersPlugin, onTrackersEvents } from '@openvtt/canvas-plugin-trackers';
import { createRollTablesPlugin } from '@openvtt/canvas-plugin-roll-tables';
import { buildRollTablesWindow } from './rolltables-window';

defineCanvasElements();

const ICONS = {
  select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3.5 18.5 11l-5.6 1.8L10.5 18 6 3.5Z"/></svg>`,
  hand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v4.5c0 4-2.7 7-6.8 7-3 0-4.4-1.2-6-3.5l-2.4-3.6c-.6-.9-.2-2 .7-2.4.7-.3 1.6-.1 2.1.6l1.4 2"/></svg>`,
  token: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M6.5 17.5c1.4-2.6 3.4-3.8 5.5-3.8s4.1 1.2 5.5 3.8"/></svg>`,
  wall: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 20 9 12l4 3 8-11"/></svg>`,
  tile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M12 3.5v17M3.5 12h17" opacity=".6"/></svg>`,
  draw: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c.5-2.5 1-4 2-5L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18c-1 1-2.5 1.5-5 2Z"/><path d="m14.5 6.5 3 3"/></svg>`,
  shape: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="6" width="12" height="12" rx="1.5"/><circle cx="17" cy="9" r="4.5"/></svg>`,
  measure: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m8 12 1.5 1.5M11 9l1.5 1.5M14 6l1.5 1.5"/></svg>`,
  ranges: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.2" opacity=".65"/><circle cx="12" cy="12" r="9.7" opacity=".35"/></svg>`,
  eraser: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 15 8.5-8.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19H8l-3-3a2 2 0 0 1 0-3Z"/><path d="M8 19h13"/></svg>`,
  fit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  dice: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>`,
  fogReveal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2m0 15v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  fogPaint: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 18.5a4.5 4.5 0 0 0 .4-8.97 6 6 0 0 0-11.7 1.48 4 4 0 0 0 .3 7.99Z"/><path d="M8 21.5h8M10 18.5h4" opacity=".55"/></svg>`,
  light: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>`,
  template: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/><path d="M5 19 20 8M5 19l11.5 3.5M20 8c-2 5-5.5 8-11.5 11.5" opacity=".9"/></svg>`,
  rollTable: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  ping: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19.4 4.6a10 10 0 0 1 0 14.8M4.6 19.4a10 10 0 0 1 0-14.8" opacity=".45"/></svg>`,
  center: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5"/></svg>`,
  rename: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-5"/><path d="M17.9 3.6a2 2 0 0 1 2.8 2.8L12.5 14.6l-3.6 1 1-3.6 8-8.4Z"/></svg>`,
  front: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M12 3.5 8.5 7M12 3.5 15.5 7"/><path d="M4.5 13.5v4A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-4" opacity=".7"/></svg>`,
};

interface ToolDef {
  id: string;
  name: string;
  kbd: string;
  icon: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select', name: 'Select', kbd: 'V', icon: ICONS.select, hint: 'Drag tokens to move (eased, ruler shows distance) · drag wall points to edit · double-click a wall to split · double-click a token to edit its art · click door to open/close · <kbd>Q</kbd> to ping · right-click opens the context menu' },
  { id: 'hand', name: 'Pan', kbd: 'H', icon: ICONS.hand, hint: 'Drag to pan · mouse wheel or pinch to zoom' },
  { id: 'token', name: 'Token', kbd: 'T', icon: ICONS.token, hint: 'Click to place a token (snaps to grid)' },
  { id: 'wall', name: 'Wall', kbd: 'W', icon: ICONS.wall, hint: 'Pick a mode/door in the subtool panel (tap the active Wall button to toggle it) · <kbd>Enter</kbd>/double-click finishes a chain · right-click cancels · <kbd>Ctrl</kbd>+right-click dismisses the tool' },
  { id: 'tile', name: 'Tile', kbd: 'I', icon: ICONS.tile, hint: 'Drag to size a tile · click for default size' },
  { id: 'draw', name: 'Draw', kbd: 'D', icon: ICONS.draw, hint: 'Drag to draw freehand' },
  { id: 'shape', name: 'Shape', kbd: 'S', icon: ICONS.shape, hint: 'Drag to draw a shape' },
  { id: 'measure', name: 'Measure', kbd: 'M', icon: ICONS.measure, hint: 'Drag to measure distance' },
  { id: 'ranges', name: 'Ranges', kbd: 'R', icon: ICONS.ranges, hint: 'Click or drag from a point/token to show range rings · rings stay put while you move tokens · <kbd>Esc</kbd> clears · right-click the canvas for presets, themes and shapes' },
  { id: 'eraser', name: 'Eraser', kbd: 'E', icon: ICONS.eraser, hint: 'Click or drag over objects to delete them' },
  { id: 'fogReveal', name: 'Reveal Fog', kbd: 'F', icon: ICONS.fogReveal, hint: 'Click or drag to reveal fog · enable fog in the panel first' },
  { id: 'fogPaint', name: 'Paint Fog', kbd: 'G', icon: ICONS.fogPaint, hint: 'Click or drag to paint fog manually' },
  { id: 'light', name: 'Light', kbd: 'L', icon: ICONS.light, hint: 'Click to place an ambient light · affects fog & lighting overlay' },
  { id: 'template', name: 'Template', kbd: 'B', icon: ICONS.template, hint: 'Click to set origin, drag to size/aim · wheel to rotate or resize · click again to place · Shift disables snap' },
  { id: 'roll-table', name: 'Tables', kbd: 'U', icon: ICONS.rollTable, hint: 'Pick a table in the subtool panel · click to drop a table anchor · right-click an anchor to draw, reset the deck or clear the result · results also live in the Roll Tables window' },
];

function tokenTexture(label: string, hue: number): string {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hue} 70% 45%)`;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = `hsl(${hue} 70% 25%)`;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 2);
  return cv.toDataURL('image/png');
}

const GRID_OPTIONS: { value: GridType; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'hex-vertical', label: 'Hex (pointy)' },
  { value: 'hex-horizontal', label: 'Hex (flat)' },
  { value: 'isometric', label: 'Isometric' },
  { value: 'none', label: 'No grid' },
];

/** Mapa grande gerado proceduralmente (2400×1500 → pirâmide de 4 níveis). */
function mapTexture(): string {
  const w = 2400;
  const h = 1500;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const terrain = ctx.createLinearGradient(0, 0, w, h);
  terrain.addColorStop(0, '#2c2418');
  terrain.addColorStop(0.5, '#38301f');
  terrain.addColorStop(1, '#241d12');
  ctx.fillStyle = terrain;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(216,190,140,0.08)';
  for (let i = 0; i < 140; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,200,230,0.22)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(80, h - 160);
  ctx.bezierCurveTo(w * 0.35, h - 420, w * 0.6, h - 60, w - 120, h - 260);
  ctx.stroke();
  const rooms = [
    [220, 200, 620, 420],
    [980, 160, 520, 380],
    [1660, 240, 560, 460],
    [320, 760, 700, 480],
    [1240, 720, 640, 520],
    [1960, 880, 320, 320],
  ];
  for (const [rx, ry, rw, rh] of rooms) {
    ctx.fillStyle = `rgba(${180 + Math.random() * 40},${150 + Math.random() * 30},${100},${0.05 + Math.random() * 0.05})`;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(216,190,140,0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(216,190,140,0.5)';
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillText(`${Math.round(rx / 50)}·${Math.round(ry / 50)}`, rx + 18, ry + 46);
  }
  return cv.toDataURL('image/png');
}

function numToHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

const TRACKERS_STORAGE_KEY = 'openvtt:playground:trackers';
const WINDOWS_STORAGE_KEY = 'openvtt:playground:windows';
const INITIAL_MEASURE_PRESET = 'dnd5e-metric';

function loadTrackersSnapshot(): unknown {
  try {
    const raw = localStorage.getItem(TRACKERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function saveTrackersSnapshot(plugin: TrackersPlugin): void {
  try {
    localStorage.setItem(TRACKERS_STORAGE_KEY, JSON.stringify(plugin.serialize()));
  } catch {
    // storage indisponível — persistência do demo é best-effort
  }
}

function loadWindowsSnapshot(): Array<Record<string, unknown>> | null {
  try {
    const raw = localStorage.getItem(WINDOWS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

function saveWindowsSnapshot(manager: WindowManager): void {
  try {
    localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(manager.serialize()));
  } catch {
    // storage indisponível — persistência do demo é best-effort
  }
}

function buildHelpContent(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const rows = TOOLS.map((t) => `<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;"><span style="color:var(--ovtt-text-dim,#9a8f78)">${t.name}</span><kbd>${t.kbd}</kbd></div>`);
  el.innerHTML = `
    <div style="color:var(--ovtt-text-dim,#9a8f78);font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;">Shortcuts</div>
    ${rows.join('')}
    <div style="color:var(--ovtt-text-dim,#9a8f78);font-size:10px;margin-top:6px;">double-click a token to edit its art · right-click for context menus · drag window edges to snap and dock</div>`;
  return el;
}

export function renderCanvas(root: HTMLElement): () => void {
  root.innerHTML = `
    <div id="canvas-stage" class="stage"></div>
    <div class="overlay page-title">
      <h1>Scene Canvas</h1>
      <p>@openvtt/canvas</p>
    </div>
    <div class="overlay panel canvas-tools" id="tools">
      ${TOOLS.map(
        (t) => `
        <button class="tool-btn" data-tool="${t.id}" title="${t.name}">
          ${t.icon}<kbd>${t.kbd}</kbd>
          <span class="tip">${t.name} <kbd>${t.kbd}</kbd></span>
        </button>`,
      ).join('')}
      <div class="sep"></div>
      <button class="tool-btn" id="fit" title="Fit scene">${ICONS.fit}<span class="tip">Fit scene</span></button>
      <button class="tool-btn" id="delete" title="Delete selected">${ICONS.trash}<span class="tip">Delete selected <kbd>Del</kbd></span></button>
      <div class="sep"></div>
      <button class="tool-btn" id="undo" title="Undo">${ICONS.undo}<span class="tip">Undo <kbd>Ctrl+Z</kbd></span></button>
      <button class="tool-btn" id="redo" title="Redo">${ICONS.redo}<span class="tip">Redo <kbd>Ctrl+Y</kbd></span></button>
    </div>
    <div class="overlay panel canvas-subtools" id="subtools" hidden></div>
    <div class="overlay panel canvas-grid">
      <label class="field"><span>Grid</span><span class="select"><select id="grid-type"></select></span></label>
      <label class="field"><span>Units</span><span class="select"><select id="measure-units"></select></span></label>
    </div>
    <div class="overlay canvas-status pill" id="status" data-state="busy">
      <span class="dot"></span><span id="status-text">booting…</span>
    </div>
    <div class="overlay canvas-hint pill" id="hint"></div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#canvas-stage')!;
  const statusPill = root.querySelector<HTMLDivElement>('#status')!;
  const statusText = root.querySelector<HTMLSpanElement>('#status-text')!;
  const hintEl = root.querySelector<HTMLDivElement>('#hint')!;
  const subtoolsEl = root.querySelector<HTMLDivElement>('#subtools')!;
  const logEl = document.createElement('div');
  logEl.className = 'log-body';
  const gridSelect = root.querySelector<HTMLSelectElement>('#grid-type')!;
  const unitsSelect = root.querySelector<HTMLSelectElement>('#measure-units')!;
  const toolButtons = new Map<string, HTMLButtonElement>();
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]')) {
    toolButtons.set(btn.dataset.tool!, btn);
  }

  for (const opt of GRID_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    gridSelect.appendChild(o);
  }

  for (const preset of Object.values(MEASURE_METRIC_PRESETS)) {
    const o = document.createElement('option');
    o.value = preset.id;
    o.textContent = preset.label;
    unitsSelect.appendChild(o);
  }
  unitsSelect.value = INITIAL_MEASURE_PRESET;

  const rollTables = createRollTablesPlugin({
    tables: [
      {
        name: 'Item Mágico',
        entries: [
          { type: 'text', text: 'Poção de Cura ([[2d4+2]] PV)', weight: 4 },
          { type: 'text', text: 'Pergaminho de [[1d3]] magias', weight: 3 },
          { type: 'text', text: 'Anel +1', weight: 1 },
        ],
      },
      {
        name: 'Tesouro',
        formula: '1d2',
        entries: [
          { type: 'text', text: 'Nada além de poeira', weight: 5 },
          { type: 'text', text: '[[2d6]] peças de ouro', weight: 3 },
          { type: 'formula', text: 'Gemas', formula: '1d4', weight: 2 },
          { type: 'table', tableRef: 'Item Mágico', weight: 1 },
        ],
      },
      {
        name: 'Clima',
        replacement: false,
        reshuffle: 'auto',
        entries: [
          { type: 'text', text: 'Ensolarado', weight: 4 },
          { type: 'text', text: 'Chuva', weight: 3 },
          { type: 'text', text: 'Neblina', weight: 2 },
          { type: 'text', text: 'Tempestade', weight: 1 },
        ],
      },
    ],
  });

  const canvas = new Canvas(stage, {
    hotkeys,
    plugins: [...standardPlugins, trackersPlugin, rollTables, demoContextMenuPlugin()],
    tools: { measure: { metrics: MEASURE_METRIC_PRESETS[INITIAL_MEASURE_PRESET].metrics.map((metric) => ({ ...metric })) } },
  });
  (window as unknown as { canvas: Canvas }).canvas = canvas;
  let disposed = false;
  let tokenHue = 210;

  const onPluginEvent = (name: string, handler: (payload: any) => void): (() => void) =>
    dynamicBus(canvas.bus).on(name, handler);

  function setStatus(state: 'ready' | 'busy' | 'error', text: string) {
    statusPill.dataset.state = state;
    statusText.textContent = text;
  }

  const log = (key: string, msg: string) => {
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    line.innerHTML = `<span class="t">${time}</span><span class="k">${key}</span> ${msg}`;
    logEl.prepend(line);
    while (logEl.childElementCount > 60) logEl.lastChild?.remove();
  };

  /* ------------------------- context menu demo ------------------------- */

  function demoContextMenuPlugin(): CanvasPlugin {
    return definePlugin({
      id: 'demo-context-menu',
      name: 'Context Menu Demo',
      install(ctx) {
        ctx.registerContextMenu({
          id: 'demo:scene',
          when: menuWhen.canvas(),
          items: [
            menu.action('demo:ping-here', 'Ping here', {
              icon: ICONS.ping,
              order: MENU_ORDER.utility,
              onClick: (c) => ctx.canvas.ping(c.x, c.y),
            }),
            menu.action('demo:center-here', 'Center here', {
              icon: ICONS.center,
              order: MENU_ORDER.utility + 10,
              onClick: (c) => ctx.canvas.centerOn(c.x, c.y),
            }),
          ],
        });

        ctx.registerContextMenu({
          id: 'demo:drawings',
          when: menuWhen.selection('drawing'),
          items: (menuCtx) => {
            const convertible = menuCtx.selection.some((obj) => {
              const doc = obj.document as { type?: string };
              return doc.type === 'rect' || doc.type === 'ellipse';
            });
            return [
              menu.action('demo:drawing-to-walls', 'Convert to walls', {
                icon: ICONS.wall,
                order: MENU_ORDER.edit,
                disabled: !convertible,
                onClick: () => convertDrawingsToWalls(),
              }),
            ];
          },
        });

        ctx.bus.tap('contextmenu:items', 'demo', (payload) => ({
          ...payload,
          items: [
            ...payload.items,
            menu.action('demo:fit-scene', 'Fit scene', {
              icon: ICONS.fit,
              order: MENU_ORDER.tail,
              onClick: () => ctx.canvas.fit(),
            }),
          ],
        }));

        ctx.bus.on('contextmenu:open', ({ target, itemCount }) => {
          log('menu', target.type === 'object' ? `${target.objectType} · ${itemCount} items` : `canvas · ${itemCount} items`);
        });
      },
    });
  }

  /* ------------------------- image editor ------------------------- */

  onPluginEvent('imageEditor:opened', ({ type, id }: any) => {
    log('imageEditor', `editing ${type} ${id.slice(0, 8)}`);
  });

  /* ------------------------- windows ------------------------- */

  let windowsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const windows = canvas.plugins.get<WindowsPlugin>('windows')?.manager ?? null;
  if (windows) {
    windows.register({
      id: 'layers',
      title: 'Layers',
      width: 250,
      height: 460,
      dock: 'left',
      factory: () => {
        const panel = document.createElement(LAYER_PANEL_TAG) as OpenVTTLayerPanel;
        panel.canvas = canvas;
        return panel;
      },
    });
    windows.register({
      id: 'eventLog',
      title: 'Event log',
      width: 460,
      height: 220,
      dock: 'bottom',
      constraints: { minHeight: 140 },
      factory: () => logEl,
    });
    windows.register({ id: 'help', title: 'Quick help', factory: () => buildHelpContent(), dock: 'right', width: 300, height: 420 });
    windows.register({
      id: 'rollTables',
      title: 'Roll Tables',
      width: 320,
      height: 480,
      dock: 'right',
      factory: () => buildRollTablesWindow(rollTables.registry, { log }),
    });
    const snapshot = loadWindowsSnapshot();
    if (snapshot && snapshot.length > 0) {
      windows.restore(snapshot);
      log('windows', 'layout restored from localStorage');
    } else {
      windows.open('layers');
      windows.open('fog');
      windows.open('help');
      windows.open('eventLog');
      windows.open('rollTables');
    }
    canvas.bus.onAny((name) => {
      if (!name.startsWith('window:')) return;
      if (windowsSaveTimer) clearTimeout(windowsSaveTimer);
      windowsSaveTimer = setTimeout(() => {
        windowsSaveTimer = null;
        saveWindowsSnapshot(windows);
      }, 400);
    });
  }

  /* ------------------------- drawings → walls ------------------------- */

  function convertDrawingsToWalls(): void {
    const drawings = canvas.selected.filter((obj) => obj.objectType === 'drawing');
    if (drawings.length === 0) {
      log('wall', 'select a rect/ellipse drawing first');
      return;
    }
    canvas.history.beginBatch();
    void (async () => {
      try {
        for (const obj of drawings) {
          const doc = obj.document as { type?: string; x?: number; y?: number; width?: number; height?: number };
          const x = doc.x ?? 0;
          const y = doc.y ?? 0;
          const width = doc.width ?? 0;
          const height = doc.height ?? 0;
          let segments: WallSegmentDataInput[] = [];
          if (doc.type === 'rect') {
            segments = chainSegments(rectPoints(x, y, width, height, 1)) as WallSegmentDataInput[];
          } else if (doc.type === 'ellipse') {
            segments = chainSegments(ellipsePoints(x + width / 2, y + height / 2, width / 2, height / 2, 32)) as WallSegmentDataInput[];
          }
          if (segments.length === 0) continue;
          await canvas.documents.create('wall', { segments });
          canvas.deleteObject(obj);
        }
        canvas.refreshSelection();
      } finally {
        canvas.history.endBatch();
      }
    })();
    log('wall', `converting ${drawings.length} drawing(s)`);
  }

  /* ------------------------- tool subtools ------------------------- */

  function subGroup(label: string, ...nodes: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'sub-group';
    const span = document.createElement('span');
    span.className = 'sub-label';
    span.textContent = label;
    const controls = document.createElement('div');
    controls.className = 'sub-controls';
    controls.append(...nodes);
    group.append(span, controls);
    return group;
  }

  function subSeg<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void): HTMLElement {
    const seg = document.createElement('div');
    seg.className = 'sub-seg';
    seg.setAttribute('role', 'radiogroup');
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.value === current));
      b.classList.toggle('on', o.value === current);
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => {
          x.classList.remove('on');
          x.setAttribute('aria-checked', 'false');
        });
        b.classList.add('on');
        b.setAttribute('aria-checked', 'true');
        onChange(o.value);
      });
      seg.appendChild(b);
    }
    return seg;
  }

  function subSwitchRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `sub-switch${value ? ' on' : ''}`;
    row.setAttribute('aria-pressed', String(value));
    const text = document.createElement('span');
    text.className = 'sub-label';
    text.textContent = label;
    const track = document.createElement('span');
    track.className = 'track';
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    track.appendChild(thumb);
    row.append(text, track);
    row.addEventListener('click', () => {
      const next = row.getAttribute('aria-pressed') !== 'true';
      row.classList.toggle('on', next);
      row.setAttribute('aria-pressed', String(next));
      onChange(next);
    });
    return row;
  }

  function subStepper(value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'sub-stepper';
    const clamp = (v: number) => Math.max(min, Math.min(max, v));
    const make = (delta: number, glyph: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = glyph;
      b.setAttribute('aria-label', delta < 0 ? 'Decrease' : 'Increase');
      b.addEventListener('click', () => {
        value = clamp(value + delta);
        val.textContent = String(value);
        onChange(value);
      });
      return b;
    };
    const val = document.createElement('span');
    val.className = 'sub-value';
    val.textContent = String(value);
    wrap.append(make(-1, '−'), val, make(1, '+'));
    return wrap;
  }

  function subSlider(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'sub-slider';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const fmt = (v: number) => (step < 1 ? v.toFixed(2) : String(v));
    const val = document.createElement('span');
    val.className = 'sub-value';
    val.textContent = fmt(value);
    const setFill = (): void => {
      const pct = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    };
    setFill();
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      setFill();
      onChange(v);
    });
    wrap.append(input, val);
    return wrap;
  }

  function subColor(value: number | string, onChange: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'sub-color';
    input.title = 'Color';
    input.value = typeof value === 'number' ? numToHex(value) : value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function subText(value: string, placeholder: string, onChange: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sub-text';
    input.placeholder = placeholder;
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function subButton(label: string, icon: string, onClick: () => void, danger = false): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sub-btn${danger ? ' danger' : ''}`;
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  function refreshTokenTexture(): void {
    const token = canvas.tools.options.token as { label?: string; texture?: string };
    const label = token?.label || '?';
    token.texture = tokenTexture(label[0].toUpperCase(), tokenHue);
  }

  const WALL_MODES = [
    { value: 'poly' as const, label: 'Line' },
    { value: 'freehand' as const, label: 'Free' },
    { value: 'quadratic' as const, label: 'Quad' },
    { value: 'cubic' as const, label: 'Cubic' },
    { value: 'ellipse' as const, label: 'Ellipse' },
    { value: 'rectangle' as const, label: 'Rect' },
  ];

  function buildSubtools(toolId: string, el: HTMLElement): void {
    if (!canvas.tools) return;
    const o = canvas.tools.options as Record<string, any>;
    switch (toolId) {
      case 'wall':
        el.append(
          subGroup(
            'Mode',
            subSeg(WALL_MODES, o.wall.mode, (v) => {
              o.wall.mode = v;
              renderSubtools('wall');
            }),
          ),
          subSwitchRow('Doors', o.wall.door, (v) => {
            o.wall.door = v;
          }),
        );
        if (o.wall.mode === 'ellipse') {
          el.append(subGroup('Segments', subStepper(o.wall.segments, 4, 64, (v) => (o.wall.segments = v))));
        }
        if (o.wall.mode === 'rectangle') {
          el.append(subGroup('Per side', subStepper(o.wall.sideSegments, 1, 16, (v) => (o.wall.sideSegments = v))));
        }
        if (o.wall.mode === 'freehand') {
          el.append(subGroup('Tolerance', subSlider(o.wall.tolerance, 1, 30, 1, (v) => (o.wall.tolerance = v))));
        }
        break;
      case 'token':
        el.append(
          subGroup('Size', subStepper(o.token.size, 1, 4, (v) => (o.token.size = v))),
          subGroup(
            'Label',
            subText(o.token.label ?? '', 'Name', (v) => {
              o.token.label = v;
              refreshTokenTexture();
            }),
          ),
          subGroup(
            'Avatar',
            subButton('Random', ICONS.dice, () => {
              tokenHue = Math.floor(Math.random() * 360);
              o.token.label = String.fromCharCode(65 + Math.floor(Math.random() * 26));
              refreshTokenTexture();
              renderSubtools('token');
            }),
          ),
        );
        break;
      case 'tile':
        el.append(
          subGroup('Width (cells)', subStepper(o.tile.width, 1, 10, (v) => (o.tile.width = v))),
          subGroup('Height (cells)', subStepper(o.tile.height, 1, 10, (v) => (o.tile.height = v))),
        );
        break;
      case 'draw':
        el.append(
          subGroup('Color', subColor(o.draw.color, (v) => (o.draw.color = v))),
          subGroup('Width', subSlider(o.draw.width, 1, 20, 1, (v) => (o.draw.width = v))),
        );
        break;
      case 'fogReveal':
      case 'fogPaint':
        el.append(subGroup('Brush', subSlider(o.fog.brushSize, 20, 300, 10, (v) => (o.fog.brushSize = v))));
        break;
      case 'light':
        el.append(
          subGroup('Dim', subSlider(o.light.dim, 0, 20, 1, (v) => (o.light.dim = v))),
          subGroup('Bright', subSlider(o.light.bright, 0, 10, 1, (v) => (o.light.bright = v))),
          subGroup('Color', subColor(o.light.color, (v) => (o.light.color = v))),
        );
        break;
      case 'ranges': {
        const ranges = canvas.plugins.get<RangesPlugin>('ranges');
        if (!ranges) break;
        const presets = [...ranges.presets.values()].map((preset) => ({ value: preset.id, label: preset.label ?? preset.id }));
        const themes = [...ranges.themes.values()].map((theme) => ({ value: theme.id, label: theme.label ?? theme.id }));
        el.append(
          subGroup('Preset', subSeg(presets, ranges.options().preset, (v) => ranges.setOptions({ preset: v }))),
          subGroup('Theme', subSeg(themes, ranges.options().theme, (v) => ranges.setOptions({ theme: v }))),
          subGroup(
            'Shape',
            subSeg(
              [
                { value: 'circle' as const, label: 'Circle' },
                { value: 'square' as const, label: 'Square' },
              ],
              ranges.options().shape,
              (v) => ranges.setOptions({ shape: v }),
            ),
          ),
          subSwitchRow('Labels', ranges.options().labels, (v) => ranges.setOptions({ labels: v })),
          subSwitchRow('Follow', ranges.options().follow, (v) => ranges.setOptions({ follow: v })),
          subGroup('Max', subStepper(ranges.options().maxRanges, 1, 5, (v) => ranges.setOptions({ maxRanges: v }))),
          subGroup('Actions', subButton('Clear', ICONS.trash, () => ranges.clear(), true)),
        );
        break;
      }
      case 'template':
        el.append(
          subGroup(
            'Shape',
            subSeg(
              [
                { value: 'circle' as const, label: 'Circle' },
                { value: 'cone' as const, label: 'Cone' },
                { value: 'ray' as const, label: 'Ray' },
              ],
              o.template.shape,
              (v) => (o.template.shape = v),
            ),
          ),
          subGroup('Dist', subSlider(o.template.distance, 1, 12, 1, (v) => (o.template.distance = v))),
          subGroup('Width', subSlider(o.template.width, 1, 6, 1, (v) => (o.template.width = v))),
          subGroup('Color', subColor(o.template.color, (v) => (o.template.color = v))),
          subSwitchRow('Snap', o.template.snap, (v) => (o.template.snap = v)),
        );
        break;
      case 'shape':
        el.append(
          subGroup(
            'Type',
            subSeg(
              [
                { value: 'rect' as const, label: 'Rect' },
                { value: 'ellipse' as const, label: 'Ellipse' },
              ],
              o.shape.kind,
              (v) => (o.shape.kind = v),
            ),
          ),
          subGroup('Color', subColor(o.shape.color, (v) => (o.shape.color = v))),
          subGroup('Fill', subSlider(o.shape.fillAlpha, 0, 1, 0.05, (v) => (o.shape.fillAlpha = v))),
        );
        break;
      case 'roll-table': {
        const options = o['roll-table'] as { tableId?: string; color?: number | string };
        const tables = rollTables.registry.list().map((table) => ({ value: table.id, label: table.name }));
        if (tables.length === 0) break;
        if (!options.tableId || !rollTables.registry.get(options.tableId)) {
          options.tableId = tables[0].value;
        }
        el.append(
          subGroup('Table', subSeg(tables, options.tableId, (v) => (options.tableId = v))),
          subGroup('Color', subColor(options.color ?? 0x8e6ff7, (v) => (options.color = v))),
        );
        break;
      }
      default:
        break;
    }
  }

  const TOOLS_WITH_SUBTOOLS = new Set([
    'wall', 'token', 'tile', 'draw', 'fogReveal', 'fogPaint', 'light', 'ranges', 'template', 'shape', 'roll-table',
  ]);

  let subtoolsOpen = true;

  const SUB_CLOSE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>';

  const mobileLayout = window.matchMedia('(max-width: 760px)');

  function positionSubtools(toolId: string): void {
    if (mobileLayout.matches || subtoolsEl.hidden) {
      subtoolsEl.style.top = '';
      return;
    }
    const btn = toolButtons.get(toolId);
    const host = subtoolsEl.offsetParent as HTMLElement | null;
    if (!btn || !host) return;
    const hostRect = host.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    let center = btnRect.top - hostRect.top + btnRect.height / 2;
    const half = subtoolsEl.offsetHeight / 2 + 8;
    center = Math.max(half, Math.min(hostRect.height - half, center));
    subtoolsEl.style.top = `${Math.round(center)}px`;
  }

  function renderSubtools(toolId: string): void {
    for (const [tid, btn] of toolButtons) {
      btn.toggleAttribute('data-subtools', TOOLS_WITH_SUBTOOLS.has(tid));
      btn.classList.toggle('sub-open', TOOLS_WITH_SUBTOOLS.has(tid) && tid === toolId && subtoolsOpen);
    }
    subtoolsEl.innerHTML = '';
    subtoolsEl.removeAttribute('aria-label');
    if (!TOOLS_WITH_SUBTOOLS.has(toolId) || !subtoolsOpen) {
      subtoolsEl.hidden = true;
      positionSubtools(toolId);
      return;
    }
    const def = TOOLS.find((t) => t.id === toolId);
    subtoolsEl.setAttribute('role', 'group');
    subtoolsEl.setAttribute('aria-label', `${def?.name ?? toolId} options`);

    const head = document.createElement('div');
    head.className = 'sub-head';
    const title = document.createElement('span');
    title.className = 'sub-title';
    title.innerHTML = `${def?.icon ?? ''}<b>${def?.name ?? toolId}</b>`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sub-close';
    close.title = 'Hide options';
    close.setAttribute('aria-label', 'Hide options');
    close.innerHTML = SUB_CLOSE_ICON;
    close.addEventListener('click', () => {
      subtoolsOpen = false;
      renderSubtools(toolId);
    });
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'sub-body';
    buildSubtools(toolId, body);

    subtoolsEl.append(head, body);
    subtoolsEl.hidden = body.childElementCount === 0;
    positionSubtools(toolId);
  }

  /* ------------------------- tool switching ------------------------- */

  function setTool(id: string): void {
    if (canvas.getCurrentToolId() === id) {
      subtoolsOpen = !subtoolsOpen;
      renderSubtools(id);
      return;
    }
    subtoolsOpen = true;
    canvas.setCurrentTool(id);
  }

  for (const [id, btn] of toolButtons) {
    btn.addEventListener('click', () => setTool(id));
  }

  function syncToolUI(id: string): void {
    for (const [tid, btn] of toolButtons) btn.classList.toggle('on', tid === id);
    const def = TOOLS.find((t) => t.id === id);
    hintEl.innerHTML = def?.hint ?? '';
    renderSubtools(id);
  }

  /* ------------------------- scene ------------------------- */

  async function drawScene() {
    const heroId = newId();
    const ogreId = newId();
    const mageId = newId();
    const scene: SceneDataInput = {
      width: 1600,
      height: 1000,
      backgroundColor: 0x14100b,
      grid: { type: 'square', size: 50, alpha: 0.22, color: 0x8a7a5c },
      maps: [{ id: newId(), x: 0, y: 0, width: 1600, height: 1000, source: mapTexture() }],
      tokens: [
        { id: heroId, x: 200, y: 200, size: 1, texture: tokenTexture('A', 38), label: 'Hero', visionRadius: 6 },
        { id: ogreId, x: 400, y: 320, size: 2, texture: tokenTexture('B', 14), label: 'Ogre' },
        { id: mageId, x: 700, y: 220, size: 1, texture: tokenTexture('C', 200), label: 'Mage', visionRadius: 5 },
      ],
      rings: [
        { id: newId(), tokenId: heroId, preset: 'blessed' },
        { id: newId(), tokenId: heroId, preset: 'hasted' },
        { id: newId(), tokenId: ogreId, preset: 'bloodied' },
        { id: newId(), tokenId: mageId, preset: 'frozen' },
      ],
      drawings: [
        {
          id: newId(),
          type: 'rect',
          x: 600, y: 500, width: 220, height: 140,
          fillColor: 0xd9a441, fillAlpha: 0.18,
          strokeColor: 0xd9a441, strokeWidth: 3,
        },
      ],
      walls: [
        {
          id: newId(),
          segments: [
            { x1: 100, y1: 600, x2: 900, y2: 600 },
            { x1: 900, y1: 600, x2: 900, y2: 900, door: true },
          ],
        },
        {
          id: newId(),
          segments: [
            { x1: 1050, y1: 150, x2: 1500, y2: 150 },
            { x1: 1500, y1: 150, x2: 1500, y2: 480 },
            { x1: 1500, y1: 480, x2: 1050, y2: 480 },
            { x1: 1050, y1: 480, x2: 1050, y2: 350 },
            { x1: 1050, y1: 350, x2: 1050, y2: 280, door: true, secret: true },
            { x1: 1050, y1: 280, x2: 1050, y2: 150 },
          ],
        },
        {
          id: newId(),
          segments: [
            { x1: 100, y1: 950, x2: 500, y2: 950, curve: 'quadratic', cp1x: 300, cp1y: 780 },
            { x1: 500, y1: 950, x2: 900, y2: 950, curve: 'cubic', cp1x: 620, cp1y: 1080, cp2x: 780, cp2y: 820 },
          ],
        },
      ],
      lights: [
        { id: newId(), x: 1275, y: 315, dim: 9, bright: 3, color: 0xffb35c },
        { id: newId(), x: 550, y: 750, dim: 7, bright: 2, color: 0x7cc4ff },
      ],
      templates: [
        { id: newId(), shape: 'circle', x: 350, y: 800, direction: 0, distance: 3, width: 1, color: 0xef5350, fillAlpha: 0.25 },
        { id: newId(), shape: 'cone', x: 700, y: 220, direction: Math.PI / 3, distance: 4, width: 1, color: 0x4fc3f7, fillAlpha: 0.25 },
      ],
      documents: {
        'roll-table': [
          { id: newId(), x: 1250, y: 780, tableId: rollTables.registry.get('Tesouro')!.id, label: 'Tesouro', color: 0xf0c168 },
          { id: newId(), x: 1400, y: 780, tableId: rollTables.registry.get('Clima')!.id, label: 'Clima', color: 0x7cc4ff },
        ],
      },
    };
    await canvas.draw(scene);
    gridSelect.value = 'square';
    log('scene', 'drawn');

    const trackers = canvas.plugins.get<TrackersPlugin>('trackers');
    if (trackers) {
      const tokenIds = canvas.documents.layer('token')?.placeables.map((token) => token.id) ?? [];
      const snapshot = loadTrackersSnapshot();
      if (snapshot) {
        trackers.hydrate(snapshot);
        trackers.prune(tokenIds);
        log('trackers', 'state restored from localStorage');
      } else {
        trackers.setDefaults(DND5E_COMBAT.trackers);
        trackers.applyDefaultsTo(tokenIds);
        const hero = tokenIds[0];
        if (hero && !trackers.list(hero).some((t) => t.name === 'Inspiration')) {
          trackers.upsert(hero, { name: 'Inspiration', kind: 'counter', value: 1, side: 'right', color: '#f0c168' });
        }
        log('trackers', 'scene defaults applied (D&D 5e · right-click a token to edit)');
      }
    }
  }

  /* ------------------------- events ------------------------- */

  const unsubs: Array<() => void> = [];
  unsubs.push(
    canvas.on('ready', ({ width, height }) => {
      if (disposed) return;
      setStatus('ready', `ready · ${Math.round(width)}×${Math.round(height)}`);
      syncToolUI('select');
      const rings = canvas.plugins.get<RingsPlugin>('rings');
      if (rings) {
        ringsBus(canvas.bus).tapResolveStyle('demo', (ctx) =>
          ctx.ring.preset === 'cursed' ? { ...ctx, style: { ...ctx.style, glow: true } } : ctx,
        );
      }
      void drawScene();
    }),
    canvas.on('tool:changed', ({ id }) => {
      if (disposed) return;
      syncToolUI(id);
      const def = TOOLS.find((t) => t.id === id);
      setStatus('ready', def ? `${def.name} tool` : id);
    }),
    canvas.on('selection:change', ({ ids }) =>
      setStatus('ready', ids.length ? `${ids.length} selected` : 'ready'),
    ),
    canvas.on('document:moved', ({ type, id, x, y }) => {
      if (type === 'token') log('token:moved', `${id.slice(0, 8)} → (${Math.round(x)}, ${Math.round(y)})`);
    }),
    canvas.on('document:create', ({ type, id }) => log(type, `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('document:delete', ({ type, id }) => log(type, `deleted ${(id ?? '?').slice(0, 8)}`)),
    onPluginEvent('ring:added', ({ ring }: any) =>
      log('ring', `+ ${ring.preset ?? ring.style.color}${ring.label ? ` · ${ring.label}` : ''}`),
    ),
    onPluginEvent('ring:removed', ({ ringId }: any) => log('ring', `− ${ringId.slice(0, 8)}`)),
    canvas.on('ping', ({ x, y }) => log('ping', `(${Math.round(x)}, ${Math.round(y)})`)),
    onPluginEvent('wall:update', (doc: any) => {
      const door = doc?.segments?.find((s: any) => s.door);
      if (door) log('door', door.doorOpen ? 'opened' : 'closed');
    }),
    onPluginEvent('measure', ({ units, pixels, label, metrics }: any) => {
      const text =
        label ??
        (Array.isArray(metrics) && metrics.length > 0
          ? metrics.map((m: any) => `${m.value}${m.suffix}`).join(' · ')
          : `${units.toFixed(1)} u`);
      setStatus('ready', `distance · ${text} (${Math.round(pixels)}px)`);
      log('measure', `${text} · ${Math.round(pixels)}px`);
    }),
    onPluginEvent('ranges:placed', ({ preset, rings, tokenId }: any) => {
      log('ranges', `placed · ${preset} · ${rings} ring${rings === 1 ? '' : 's'}${tokenId ? ' · follows token' : ''}`);
    }),
    onPluginEvent('ranges:cleared', ({ count }: any) => {
      log('ranges', `cleared ${count} range${count === 1 ? '' : 's'}`);
    }),
    onPluginEvent('roll-table:drawn', ({ tableName, results }: any) => {
      log('roll-table', `${tableName} → ${(results as string[]).join(', ')}`);
    }),
    onPluginEvent('roll-table:error', ({ tableId, code, message }: any) => {
      log('roll-table', `${tableId.slice(0, 8)} · ${code} · ${message}`);
    }),
    onPluginEvent('roll-table:reset', ({ tableId }: any) => {
      log('roll-table', `${tableId.slice(0, 8)} · deck reset`);
    }),
    onPluginEvent('map:progress', ({ loaded, total }: any) => {
      setStatus('busy', `map · ${Math.round((loaded / Math.max(1, total)) * 100)}%`);
    }),
    onPluginEvent('map:loaded', ({ width, height, levels }: any) => {
      setStatus('ready', 'ready');
      log('map', `streamed ${width}×${height} · ${levels} LOD level${levels === 1 ? '' : 's'}`);
    }),
    onPluginEvent('map:error', ({ message }: any) => {
      log('map', `error · ${message}`);
    }),
  );

  let trackersSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const flushTrackersSave = (): void => {
    if (trackersSaveTimer) {
      clearTimeout(trackersSaveTimer);
      trackersSaveTimer = null;
    }
    const plugin = canvas.plugins.get<TrackersPlugin>('trackers');
    if (plugin) saveTrackersSnapshot(plugin);
  };

  unsubs.push(
    onTrackersEvents(canvas.bus, {
      changed: () => {
        if (trackersSaveTimer) clearTimeout(trackersSaveTimer);
        trackersSaveTimer = setTimeout(() => {
          trackersSaveTimer = null;
          flushTrackersSave();
        }, 400);
      },
      value: ({ name, before, after }) => log('trackers', `${name} ${before} → ${after}`),
      applied: ({ count }) => log('trackers', `defaults applied to ${count} token${count === 1 ? '' : 's'}`),
    }),
  );

  gridSelect.addEventListener('change', () => {
    canvas.grid.setType(gridSelect.value as GridType);
    log('grid', `→ ${gridSelect.value}`);
  });

  unitsSelect.addEventListener('change', () => {
    canvas.plugins.get<MeasurePlugin>('measure')?.setMetrics(unitsSelect.value);
    log('measure', `units → ${unitsSelect.value}`);
  });

  root.querySelector<HTMLButtonElement>('#fit')!.addEventListener('click', () => canvas.fit());
  root.querySelector<HTMLButtonElement>('#delete')!.addEventListener('click', () => canvas.deleteSelected());

  const undoBtn = root.querySelector<HTMLButtonElement>('#undo')!;
  const redoBtn = root.querySelector<HTMLButtonElement>('#redo')!;
  undoBtn.addEventListener('click', () => canvas.undo());
  redoBtn.addEventListener('click', () => canvas.redo());
  undoBtn.disabled = true;
  redoBtn.disabled = true;
  unsubs.push(
    canvas.on('history:change', ({ canUndo, canRedo }) => {
      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
    }),
  );

  const repositionSubtools = (): void => positionSubtools(canvas.getCurrentToolId());
  window.addEventListener('resize', repositionSubtools);

  /* ------------------------- boot ------------------------- */

  void canvas.initialize().then(() => {
    refreshTokenTexture();
  }).catch((err) => {
    console.error(err);
    setStatus('error', 'error — see console');
  });

  return () => {
    disposed = true;
    window.removeEventListener('resize', repositionSubtools);
    for (const u of unsubs) u();
    if (trackersSaveTimer) flushTrackersSave();
    if (windowsSaveTimer && windows) {
      clearTimeout(windowsSaveTimer);
      windowsSaveTimer = null;
      saveWindowsSnapshot(windows);
    }
    try {
      canvas.destroy();
    } catch {
      // ignore
    }
  };
}
