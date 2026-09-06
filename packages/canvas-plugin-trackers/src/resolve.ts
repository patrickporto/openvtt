import { interpolateColor, normalizeTrackerColor, type NormalizedColor } from './color';
import type { Tracker, VisibilityMode } from './schemas';

/** Quem está olhando — o host alimenta papel e posse dos tokens. */
export interface ViewerContext {
  readonly role: 'gm' | 'player';
  owns(tokenId: string): boolean;
}

export const EVERYTHING_VIEWER: ViewerContext = { role: 'gm', owns: () => true };

/** Estado de interação do token no momento da resolução. */
export interface TrackerUiState {
  readonly hovered: boolean;
  readonly selected: boolean;
}

/** Valor resolvido da fonte de um tracker (inline ou resolver customizado). */
export interface SourceValue {
  readonly value: number;
  readonly max?: number;
}

/** Tudo o que o renderer precisa, pré-computado e puro. */
export interface ResolvedTracker {
  readonly tracker: Tracker;
  readonly value: number;
  readonly max: number | undefined;
  /** Preenchimento 0..1 da barra (segmentos/invert aplicados); counters → undefined. */
  readonly ratio: number | undefined;
  readonly label: string;
  readonly visible: boolean;
  readonly color: NormalizedColor;
  readonly fillColor: string;
}

export function audienceModeFor(tokenId: string, tracker: Tracker, viewer: ViewerContext): VisibilityMode {
  const audience = tracker.audience;
  if (viewer.role === 'gm') return audience.gm;
  if (viewer.owns(tokenId)) return audience.owner;
  return audience.others;
}

export function computeVisibility(
  tokenId: string,
  tracker: Tracker,
  value: number,
  viewer: ViewerContext,
  ui: TrackerUiState,
): boolean {
  if (!tracker.visible) return false;
  const mode = audienceModeFor(tokenId, tracker, viewer);
  const byMode =
    mode === 'always'
      ? true
      : mode === 'never'
        ? false
        : mode === 'hover'
          ? ui.hovered
          : ui.selected || ui.hovered;
  if (!byMode) return false;
  if (tracker.hideEmpty && value <= tracker.min) return false;
  if (tracker.hideFull && tracker.max !== undefined && value >= tracker.max) return false;
  return true;
}

export function computeRatio(tracker: Tracker, value: number, max: number | undefined): number | undefined {
  if (tracker.kind !== 'bar' || max === undefined) return undefined;
  const min = tracker.min;
  if (max <= min) return undefined;
  const raw = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const segmented =
    tracker.segments > 0 ? Math.min(1, Math.ceil(raw * tracker.segments) / tracker.segments) : raw;
  return tracker.invert ? 1 - segmented : segmented;
}

export function formatTrackerNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

export function computeLabel(tracker: Tracker, value: number, max: number | undefined): string {
  if (tracker.label === 'none') return '';
  const min = tracker.min;
  const raw = max !== undefined && max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  let core: string;
  switch (tracker.label) {
    case 'value':
      if (tracker.segments > 0 && max !== undefined && max > min) {
        core = String(Math.ceil(raw * tracker.segments));
      } else {
        core = formatTrackerNumber(value);
      }
      break;
    case 'max':
      core = max !== undefined ? formatTrackerNumber(max) : formatTrackerNumber(value);
      break;
    case 'fraction':
      if (max !== undefined && max > min) {
        core =
          tracker.segments > 0
            ? `${Math.ceil(raw * tracker.segments)}/${tracker.segments}`
            : `${formatTrackerNumber(value)}/${formatTrackerNumber(max)}`;
      } else {
        core = formatTrackerNumber(value);
      }
      break;
    case 'percent':
      core = max !== undefined && max > min ? `${Math.round(raw * 100)}%` : formatTrackerNumber(value);
      break;
    default:
      core = formatTrackerNumber(value);
  }
  return `${tracker.prefix}${core}${tracker.units}`;
}

/** Pipeline puro completo — os hooks do bus sobrepõem cada etapa depois. */
export function resolveTracker(
  tokenId: string,
  tracker: Tracker,
  source: SourceValue,
  viewer: ViewerContext,
  ui: TrackerUiState,
): ResolvedTracker {
  const value = source.value;
  const max = source.max ?? tracker.max;
  const color = normalizeTrackerColor(tracker.color, tracker.kind);
  const rawRatio =
    tracker.kind === 'bar' && max !== undefined && max > tracker.min
      ? Math.min(1, Math.max(0, (value - tracker.min) / (max - tracker.min)))
      : undefined;
  return {
    tracker,
    value,
    max,
    ratio: computeRatio(tracker, value, max),
    label: computeLabel(tracker, value, max),
    visible: computeVisibility(tokenId, tracker, value, viewer, ui),
    color,
    fillColor: rawRatio === undefined ? color.max : interpolateColor(color.min, color.max, rawRatio),
  };
}
