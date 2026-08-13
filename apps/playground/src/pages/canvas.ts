import { Canvas, defineCanvasElements, newId, type OpenVTTFogPanel, type OpenVTTLayerPanel, type SceneDataInput, type GridType } from '@openvtt/canvas';

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
  eraser: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 15 8.5-8.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19H8l-3-3a2 2 0 0 1 0-3Z"/><path d="M8 19h13"/></svg>`,
  fit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  dice: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>`,
  fogReveal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2m0 15v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  fogPaint: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 18.5a4.5 4.5 0 0 0 .4-8.97 6 6 0 0 0-11.7 1.48 4 4 0 0 0 .3 7.99Z"/><path d="M8 21.5h8M10 18.5h4" opacity=".55"/></svg>`,
  light: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>`,
  template: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/><path d="M5 19 20 8M5 19l11.5 3.5M20 8c-2 5-5.5 8-11.5 11.5" opacity=".9"/></svg>`,
};

interface ToolDef {
  id: string;
  name: string;
  kbd: string;
  icon: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select', name: 'Select', kbd: 'V', icon: ICONS.select, hint: 'Drag tokens to move (ruler shows distance) · drag wall points to edit (joints move together) · double-click a wall to split · click door to open/close · <kbd>Ctrl</kbd>+right-click door = secret · <kbd>Q</kbd> to ping' },
  { id: 'hand', name: 'Pan', kbd: 'H', icon: ICONS.hand, hint: 'Drag to pan · mouse wheel or pinch to zoom' },
  { id: 'token', name: 'Token', kbd: 'T', icon: ICONS.token, hint: 'Click to place a token (snaps to grid)' },
  { id: 'wall', name: 'Wall', kbd: 'W', icon: ICONS.wall, hint: 'Pick a mode below · <kbd>Enter</kbd>/double-click finishes a chain · right-click cancels · <kbd>Ctrl</kbd>+right-click dismisses the tool' },
  { id: 'tile', name: 'Tile', kbd: 'I', icon: ICONS.tile, hint: 'Drag to size a tile · click for default size' },
  { id: 'draw', name: 'Draw', kbd: 'D', icon: ICONS.draw, hint: 'Drag to draw freehand' },
  { id: 'shape', name: 'Shape', kbd: 'S', icon: ICONS.shape, hint: 'Drag to draw a shape' },
  { id: 'measure', name: 'Measure', kbd: 'M', icon: ICONS.measure, hint: 'Drag to measure distance' },
  { id: 'eraser', name: 'Eraser', kbd: 'E', icon: ICONS.eraser, hint: 'Click or drag over objects to delete them' },
  { id: 'fogReveal', name: 'Reveal Fog', kbd: 'F', icon: ICONS.fogReveal, hint: 'Click or drag to reveal fog · enable fog in the panel first' },
  { id: 'fogPaint', name: 'Paint Fog', kbd: 'G', icon: ICONS.fogPaint, hint: 'Click or drag to paint fog manually' },
  { id: 'light', name: 'Light', kbd: 'L', icon: ICONS.light, hint: 'Click to place an ambient light · affects fog & lighting overlay' },
  { id: 'template', name: 'Template', kbd: 'B', icon: ICONS.template, hint: 'Click to set origin, then drag to aim · click again to place' },
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

function numToHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
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
    <div class="overlay panel canvas-options" id="options"></div>
    <div class="overlay panel canvas-grid">
      <label class="field"><span>Grid</span><span class="select"><select id="grid-type"></select></span></label>
    </div>
    <div class="overlay side-stack">
      <openvtt-layer-panel id="layer-panel"></openvtt-layer-panel>
      <openvtt-fog-panel id="fog-panel"></openvtt-fog-panel>
    </div>
    <div class="overlay canvas-status pill" id="status" data-state="busy">
      <span class="dot"></span><span id="status-text">booting…</span>
    </div>
    <div class="overlay canvas-hint pill" id="hint"></div>
    <div class="overlay panel log-panel" id="log-panel">
      <div class="log-head" id="log-head"><span>Event log</span>${ICONS.chevron}</div>
      <div class="log-body" id="event-log"></div>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#canvas-stage')!;
  const statusPill = root.querySelector<HTMLDivElement>('#status')!;
  const statusText = root.querySelector<HTMLSpanElement>('#status-text')!;
  const hintEl = root.querySelector<HTMLDivElement>('#hint')!;
  const optionsEl = root.querySelector<HTMLDivElement>('#options')!;
  const logPanel = root.querySelector<HTMLDivElement>('#log-panel')!;
  const logEl = root.querySelector<HTMLDivElement>('#event-log')!;
  const gridSelect = root.querySelector<HTMLSelectElement>('#grid-type')!;
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

  const canvas = new Canvas(stage);
  (window as unknown as { canvas: Canvas }).canvas = canvas;
  root.querySelector<OpenVTTLayerPanel>('#layer-panel')!.canvas = canvas;
  root.querySelector<OpenVTTFogPanel>('#fog-panel')!.canvas = canvas;
  let disposed = false;
  let tokenHue = 210;

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

  root.querySelector<HTMLDivElement>('#log-head')!.addEventListener('click', () => {
    logPanel.classList.toggle('closed');
  });

  /* ------------------------- options bar ------------------------- */

  function opt(label: string, ...nodes: HTMLElement[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'opt';
    const span = document.createElement('span');
    span.textContent = label;
    const row = document.createElement('div');
    row.className = 'row';
    for (const n of nodes) row.appendChild(n);
    wrap.append(span, row);
    return wrap;
  }

  function numField(value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'num';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, Number(input.value) || min));
      input.value = String(v);
      onChange(v);
    });
    return input;
  }

  function colorField(value: number | string, onChange: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'sw';
    input.value = typeof value === 'number' ? numToHex(value) : value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function rangeField(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'rng';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => onChange(Number(input.value)));
    return input;
  }

  function textField(value: string, placeholder: string, onChange: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'num';
    input.style.width = '90px';
    input.placeholder = placeholder;
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }

  function switchField(value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    const track = document.createElement('span');
    track.className = 'track';
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, track);
    return label;
  }

  function segField<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void): HTMLElement {
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const o of options) {
      const b = document.createElement('button');
      b.textContent = o.label;
      b.classList.toggle('on', o.value === current);
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onChange(o.value);
      });
      seg.appendChild(b);
    }
    return seg;
  }

  function miniBtn(label: string, icon: string, danger: boolean, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.className = `mini-btn${danger ? ' danger' : ''}`;
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  function refreshTokenTexture(): void {
    const label = canvas.tools.options.token.label || '?';
    canvas.tools.options.token.texture = tokenTexture(label[0].toUpperCase(), tokenHue);
  }

  function renderOptions(toolId: string): void {
    optionsEl.innerHTML = '';
    if (!canvas.tools) return;
    const o = canvas.tools.options;
    switch (toolId) {
      case 'select':
        optionsEl.append(
          miniBtn('Fit', ICONS.fit, false, () => canvas.fit()),
          miniBtn('Delete', ICONS.trash, true, () => canvas.deleteSelected()),
          miniBtn('Join points', ICONS.select, false, () => {
            const joined = canvas.joinWallEndpoints(8);
            log('wall', joined ? `joined ${joined} endpoints` : 'no endpoints to join');
          }),
          miniBtn('Close doors', ICONS.wall, false, () => {
            canvas.closeAllDoors();
            log('door', 'all doors closed');
          }),
          miniBtn('Enclose', ICONS.fit, false, () => {
            canvas.encloseScene();
            log('wall', 'scene enclosed');
          }),
          miniBtn('Draw→Walls', ICONS.wall, false, () => {
            const converted = canvas.convertDrawingsToWalls();
            log('wall', converted ? `converted ${converted} drawing(s)` : 'select a rect/ellipse drawing first');
          }),
        );
        break;
      case 'hand':
        optionsEl.append(miniBtn('Fit', ICONS.fit, false, () => canvas.fit()));
        break;
      case 'token':
        optionsEl.append(
          opt('Size', numField(o.token.size, 1, 4, (v) => (o.token.size = v))),
          opt(
            'Label',
            textField(o.token.label ?? '', 'Name', (v) => {
              o.token.label = v;
              refreshTokenTexture();
            }),
          ),
          opt(
            'Avatar',
            miniBtn('New', ICONS.dice, false, () => {
              tokenHue = Math.floor(Math.random() * 360);
              o.token.label = String.fromCharCode(65 + Math.floor(Math.random() * 26));
              refreshTokenTexture();
              renderOptions('token');
            }),
          ),
        );
        break;
      case 'wall': {
        optionsEl.append(
          opt(
            'Mode',
            segField(
              [
                { value: 'line' as const, label: 'Line' },
                { value: 'freehand' as const, label: 'Free' },
                { value: 'quadratic' as const, label: 'Quad' },
                { value: 'cubic' as const, label: 'Cubic' },
                { value: 'ellipse' as const, label: 'Ellipse' },
                { value: 'rectangle' as const, label: 'Rect' },
              ],
              o.wall.mode,
              (v) => {
                o.wall.mode = v;
                renderOptions('wall');
              },
            ),
          ),
          opt('Door', switchField(o.wall.door, (v) => (o.wall.door = v))),
        );
        if (o.wall.mode === 'ellipse') {
          optionsEl.append(opt('Segments', numField(o.wall.segments, 4, 64, (v) => (o.wall.segments = v))));
        }
        if (o.wall.mode === 'rectangle') {
          optionsEl.append(opt('Per side', numField(o.wall.sideSegments, 1, 16, (v) => (o.wall.sideSegments = v))));
        }
        if (o.wall.mode === 'freehand') {
          optionsEl.append(opt('Tolerance', rangeField(o.wall.tolerance, 1, 30, 1, (v) => (o.wall.tolerance = v))));
        }
        break;
      }
      case 'tile':
        optionsEl.append(
          opt('Width (cells)', numField(o.tile.width, 1, 10, (v) => (o.tile.width = v))),
          opt('Height (cells)', numField(o.tile.height, 1, 10, (v) => (o.tile.height = v))),
        );
        break;
      case 'draw':
        optionsEl.append(
          opt('Color', colorField(o.draw.color, (v) => (o.draw.color = v))),
          opt('Width', rangeField(o.draw.width, 1, 20, 1, (v) => (o.draw.width = v))),
        );
        break;
      case 'fogReveal':
      case 'fogPaint':
        optionsEl.append(
          opt('Brush', rangeField(o.fog.brushSize, 20, 300, 10, (v) => (o.fog.brushSize = v))),
        );
        break;
      case 'light':
        optionsEl.append(
          opt('Dim', rangeField(o.light.dim, 0, 20, 1, (v) => (o.light.dim = v))),
          opt('Bright', rangeField(o.light.bright, 0, 10, 1, (v) => (o.light.bright = v))),
          opt('Color', colorField(o.light.color, (v) => (o.light.color = v))),
        );
        break;
      case 'template':
        optionsEl.append(
          opt(
            'Shape',
            segField(
              [
                { value: 'circle' as const, label: 'Circle' },
                { value: 'cone' as const, label: 'Cone' },
                { value: 'ray' as const, label: 'Ray' },
              ],
              o.template.shape,
              (v) => (o.template.shape = v),
            ),
          ),
          opt('Dist', rangeField(o.template.distance, 1, 12, 1, (v) => (o.template.distance = v))),
          opt('Width', rangeField(o.template.width, 1, 6, 1, (v) => (o.template.width = v))),
          opt('Color', colorField(o.template.color, (v) => (o.template.color = v))),
        );
        break;
      case 'shape':
        optionsEl.append(
          opt(
            'Type',
            segField(
              [
                { value: 'rect' as const, label: 'Rect' },
                { value: 'ellipse' as const, label: 'Ellipse' },
              ],
              o.shape.kind,
              (v) => (o.shape.kind = v),
            ),
          ),
          opt('Color', colorField(o.shape.color, (v) => (o.shape.color = v))),
          opt('Fill', rangeField(o.shape.fillAlpha, 0, 1, 0.05, (v) => (o.shape.fillAlpha = v))),
        );
        break;
      default:
        break;
    }
  }

  /* ------------------------- tool switching ------------------------- */

  function setTool(id: string): void {
    canvas.setCurrentTool(id);
  }

  for (const [id, btn] of toolButtons) {
    btn.addEventListener('click', () => setTool(id));
  }

  function syncToolUI(id: string): void {
    for (const [tid, btn] of toolButtons) btn.classList.toggle('on', tid === id);
    const def = TOOLS.find((t) => t.id === id);
    hintEl.innerHTML = def?.hint ?? '';
    renderOptions(id);
  }

  /* ------------------------- scene ------------------------- */

  async function drawScene() {
    const scene: SceneDataInput = {
      width: 1600,
      height: 1000,
      backgroundColor: 0x14100b,
      grid: { type: 'square', size: 50, alpha: 0.22, color: 0x8a7a5c },
      tokens: [
        { id: newId(), x: 200, y: 200, size: 1, texture: tokenTexture('A', 38), label: 'Hero', visionRadius: 6 },
        { id: newId(), x: 400, y: 320, size: 2, texture: tokenTexture('B', 14), label: 'Ogre' },
        { id: newId(), x: 700, y: 220, size: 1, texture: tokenTexture('C', 200), label: 'Mage', visionRadius: 5 },
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
    };
    await canvas.draw(scene);
    gridSelect.value = 'square';
    log('scene', 'drawn');
  }

  /* ------------------------- events ------------------------- */

  const unsubs: Array<() => void> = [];
  unsubs.push(
    canvas.on('ready', ({ width, height }) => {
      if (disposed) return;
      setStatus('ready', `ready · ${Math.round(width)}×${Math.round(height)}`);
      syncToolUI('select');
      void drawScene();
    }),
    canvas.on('tool:changed', ({ id }) => {
      if (disposed) return;
      syncToolUI(id);
      const def = TOOLS.find((t) => t.id === id);
      setStatus('ready', def ? `${def.name} tool` : id);
    }),
    canvas.on('token:moved', ({ id, x, y }) =>
      log('token:moved', `${id.slice(0, 8)} → (${Math.round(x)}, ${Math.round(y)})`),
    ),
    canvas.on('token:selected', ({ ids }) =>
      setStatus('ready', ids.length ? `${ids.length} selected` : 'ready'),
    ),
    canvas.on('token:create', ({ id }) => log('token', `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('wall:create', ({ id }) => log('wall', `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('wall:update', ({ id, segments }) => {
      const door = segments?.find((s) => s.door);
      if (door) log('door', door.doorOpen ? 'opened' : 'closed');
      else log('wall', `updated ${(id ?? '?').slice(0, 8)}`);
    }),
    canvas.on('light:create', ({ id }) => log('light', `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('template:create', ({ id, shape }) => log('template', `created ${shape} ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('ping', ({ x, y }) => log('ping', `(${Math.round(x)}, ${Math.round(y)})`)),
    canvas.on('tile:create', ({ id }) => log('tile', `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('drawing:create', ({ id }) => log('drawing', `created ${(id ?? '?').slice(0, 8)}`)),
    canvas.on('measure', ({ units, pixels }) => {
      setStatus('ready', `distance · ${units.toFixed(1)} u (${Math.round(pixels)}px)`);
      log('measure', `${units.toFixed(1)} u · ${Math.round(pixels)}px`);
    }),
  );

  gridSelect.addEventListener('change', () => {
    canvas.grid.setType(gridSelect.value as GridType);
    log('grid', `→ ${gridSelect.value}`);
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

  /* ------------------------- boot ------------------------- */

  void canvas.initialize().then(() => {
    refreshTokenTexture();
  }).catch((err) => {
    console.error(err);
    setStatus('error', 'error — see console');
  });

  return () => {
    disposed = true;
    for (const u of unsubs) u();
    try {
      canvas.destroy();
    } catch {
      // ignore
    }
  };
}
