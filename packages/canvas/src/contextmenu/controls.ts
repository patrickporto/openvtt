/**
 * Controles de formulário compartilhados para itens custom do context
 * menu. Centralizam a marcação e o protocolo de histórico: preview ao
 * vivo via `live` (sem histórico) e um único commit history-aware via
 * `commit(value, before)` no evento `change`, com `before` capturado no
 * momento da renderização.
 */

const ROW_STYLE = 'display:flex;align-items:center;gap:8px;padding:2px 4px;width:100%';
const LABEL_STYLE = 'flex:none;font-size:11px;font-weight:600;opacity:.75';
const VALUE_STYLE = 'flex:none;width:34px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;opacity:.7';
const RANGE_STYLE = 'flex:1;min-width:80px;accent-color:var(--ovtt-accent,#f0c168)';
const COLOR_STYLE = 'width:22px;height:22px;padding:0;border:1px solid rgba(255,255,255,.15);border-radius:5px;background:transparent;cursor:pointer';
const TEXT_STYLE = 'flex:1;min-width:100px;background:transparent;border:1px solid rgba(255,255,255,.15);border-radius:5px;color:inherit;font:inherit;padding:2px 6px';

export interface MenuSliderSpec {
  readonly label?: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly format?: (value: number) => string;
  /** Preview ao vivo (sem histórico) — ex.: `obj.update` + `scene:refresh`. */
  readonly live?: (value: number) => void;
  /** Commit history-aware — receba o valor original para `{ before }`. Omita para controles puramente live (não-undoáveis). */
  readonly commit?: (value: number, before: number) => void;
}

export interface MenuColorSpec {
  readonly label?: string;
  readonly value: string;
  readonly live?: (value: string) => void;
  readonly commit: (value: string, before: string) => void;
}

export interface MenuTextSpec {
  readonly label?: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly live?: (value: string) => void;
  readonly commit: (value: string, before: string) => void;
}

function rowWrap(label?: string): { wrap: HTMLDivElement; lead: HTMLSpanElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = ROW_STYLE;
  const lead = document.createElement('span');
  if (label !== undefined) {
    lead.textContent = label;
    lead.style.cssText = LABEL_STYLE;
    wrap.appendChild(lead);
  }
  return { wrap, lead };
}

export function sliderRow(spec: MenuSliderSpec): HTMLDivElement {
  const { wrap } = rowWrap(spec.label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step ?? 1);
  input.style.cssText = RANGE_STYLE;
  input.value = String(spec.value);
  const value = document.createElement('span');
  value.style.cssText = VALUE_STYLE;
  const show = (v: number): void => {
    value.textContent = spec.format ? spec.format(v) : String(v);
  };
  show(spec.value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    spec.live?.(v);
  });
  input.addEventListener('change', () => spec.commit?.(Number(input.value), spec.value));
  wrap.append(input, value);
  return wrap;
}

export function colorRow(spec: MenuColorSpec): HTMLDivElement {
  const { wrap } = rowWrap(spec.label);
  const input = document.createElement('input');
  input.type = 'color';
  input.style.cssText = COLOR_STYLE;
  input.value = spec.value;
  input.addEventListener('input', () => spec.live?.(input.value));
  input.addEventListener('change', () => spec.commit(input.value, spec.value));
  wrap.appendChild(input);
  return wrap;
}

export function textRow(spec: MenuTextSpec): HTMLDivElement {
  const { wrap } = rowWrap(spec.label);
  const input = document.createElement('input');
  input.type = 'text';
  input.style.cssText = TEXT_STYLE;
  input.value = spec.value;
  if (spec.placeholder !== undefined) input.placeholder = spec.placeholder;
  input.addEventListener('input', () => spec.live?.(input.value));
  input.addEventListener('change', () => spec.commit(input.value, spec.value));
  wrap.appendChild(input);
  return wrap;
}

/** Controles de formulário do menu — helpers puros de DOM por chamada. */
export const menuControls = Object.freeze({ slider: sliderRow, color: colorRow, text: textRow });
