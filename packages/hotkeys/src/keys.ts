import { InvalidComboError } from './errors';
import type { KeyBind, Modifier } from './schema';

export interface MinimalKeyboardEvent {
  readonly code?: string;
  readonly key?: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly repeat?: boolean;
  readonly target?: unknown;
  preventDefault?(): void;
  stopPropagation?(): void;
}

export interface ComboInput {
  key: string;
  modifiers?: readonly (Modifier | string)[];
}

export interface ParsedCombo {
  key: string;
  modifiers: Modifier[];
}

export const MODIFIERS: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

const DISPLAY_ORDER: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta',
};

const CODE_ALIASES: Record<string, string> = {
  Space: 'space',
  Escape: 'escape',
  Enter: 'enter',
  NumpadEnter: 'numpadenter',
  Backspace: 'backspace',
  Tab: 'tab',
  CapsLock: 'capslock',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Insert: 'insert',
  Delete: 'delete',
  Semicolon: 'semicolon',
  Quote: 'quote',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
  Backquote: 'backquote',
  BracketLeft: 'bracketleft',
  BracketRight: 'bracketright',
  Backslash: 'backslash',
  Minus: 'minus',
  Equal: 'equal',
  IntlBackslash: 'intlbackslash',
  IntlRo: 'intlro',
  IntlYen: 'intlyen',
  NumpadAdd: 'numpadadd',
  NumpadSubtract: 'numpadsubtract',
  NumpadMultiply: 'numpadmultiply',
  NumpadDivide: 'numpaddivide',
  NumpadDecimal: 'numpaddecimal',
  PrintScreen: 'printscreen',
  ScrollLock: 'scrolllock',
  Pause: 'pause',
  ContextMenu: 'contextmenu',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  AltLeft: 'alt',
  AltRight: 'alt',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  MetaLeft: 'meta',
  MetaRight: 'meta',
  OSLeft: 'meta',
  OSRight: 'meta',
};

const KEY_LABELS: Record<string, string> = {
  space: 'Space',
  escape: 'Escape',
  enter: 'Enter',
  numpadenter: 'Numpad Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  capslock: 'Caps Lock',
  arrowup: 'Arrow Up',
  arrowdown: 'Arrow Down',
  arrowleft: 'Arrow Left',
  arrowright: 'Arrow Right',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  insert: 'Insert',
  delete: 'Delete',
  semicolon: ';',
  quote: "'",
  comma: ',',
  period: '.',
  slash: '/',
  backquote: '`',
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  minus: '-',
  equal: '=',
  numpadadd: 'Num +',
  numpadsubtract: 'Num -',
  numpadmultiply: 'Num *',
  numpaddivide: 'Num /',
  numpaddecimal: 'Num .',
  printscreen: 'Print Screen',
  scrolllock: 'Scroll Lock',
  pause: 'Pause',
  contextmenu: 'Context Menu',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
};

export function isModifier(value: string): value is Modifier {
  return value === 'ctrl' || value === 'alt' || value === 'shift' || value === 'meta';
}

export function keyFromEvent(event: MinimalKeyboardEvent): string {
  const code = event.code;
  if (typeof code === 'string' && code.length > 0) {
    return normalizeCode(code);
  }
  const key = event.key;
  if (typeof key !== 'string' || key.length === 0) return '';
  if (key.length === 1) return key.toLowerCase();
  if (MODIFIER_ALIASES[key.toLowerCase()]) return MODIFIER_ALIASES[key.toLowerCase()];
  return normalizeCode(key);
}

export function eventModifiers(event: MinimalKeyboardEvent): Modifier[] {
  const mods: Modifier[] = [];
  if (event.ctrlKey) mods.push('ctrl');
  if (event.altKey) mods.push('alt');
  if (event.shiftKey) mods.push('shift');
  if (event.metaKey) mods.push('meta');
  return mods;
}

export function parseCombo(input: string | ComboInput): ParsedCombo {
  if (typeof input === 'string') {
    const parts = input
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0);
    if (parts.length === 0) throw new InvalidComboError(input, 'combo is empty');
    const rawKey = parts[parts.length - 1];
    const rawModifiers = parts.slice(0, -1);
    const modifiers = new Set<Modifier>();
    for (const part of rawModifiers) {
      const mod = MODIFIER_ALIASES[part];
      if (!mod) throw new InvalidComboError(input, `"${part}" is not a known modifier`);
      modifiers.add(mod);
    }
    return { key: validateKeyToken(rawKey, input), modifiers: sortModifiers(modifiers) };
  }

  if (!input || typeof input !== 'object' || typeof input.key !== 'string') {
    throw new InvalidComboError(input, 'expected a string or { key, modifiers }');
  }
  const modifiers = new Set<Modifier>();
  for (const part of input.modifiers ?? []) {
    const mod = MODIFIER_ALIASES[String(part).trim().toLowerCase()];
    if (!mod) throw new InvalidComboError(input, `"${String(part)}" is not a known modifier`);
    modifiers.add(mod);
  }
  return { key: validateKeyToken(input.key, input), modifiers: sortModifiers(modifiers) };
}

export function formatCombo(combo: { key: string; modifiers?: readonly Modifier[] }): string {
  const mods = new Set(combo.modifiers ?? []);
  const parts = DISPLAY_ORDER.filter((mod) => mods.has(mod)).map((mod) => KEY_LABELS[mod]);
  parts.push(keyLabel(combo.key));
  return parts.join('+');
}

export function comboId(combo: { key: string; modifiers?: readonly Modifier[] }): string {
  const mods = new Set(combo.modifiers ?? []);
  const parts: string[] = [...MODIFIERS].filter((mod) => mods.has(mod));
  parts.push(combo.key);
  return parts.join('+');
}

export function keyLabel(token: string): string {
  if (KEY_LABELS[token]) return KEY_LABELS[token];
  if (token.length === 1) return token.toUpperCase();
  if (/^f\d{1,2}$/.test(token)) return token.toUpperCase();
  if (/^numpad\d$/.test(token)) return `Num ${token.slice(6)}`;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function matchesBind(
  bind: KeyBind | ParsedCombo,
  event: MinimalKeyboardEvent,
  reservedModifiers: readonly Modifier[] = [],
): boolean {
  if (keyFromEvent(event) !== bind.key) return false;
  const held = new Set(eventModifiers(event));
  const bindMods = new Set(bind.modifiers);
  for (const mod of bindMods) {
    if (!held.has(mod)) return false;
  }
  for (const mod of held) {
    if (!bindMods.has(mod) && !reservedModifiers.includes(mod)) return false;
  }
  return true;
}

function sortModifiers(mods: Iterable<Modifier>): Modifier[] {
  return [...new Set(mods)].sort();
}

function validateKeyToken(raw: string, input: unknown): string {
  const token = normalizeCode(raw.trim());
  if (!/^[a-z0-9]+$/.test(token)) {
    throw new InvalidComboError(input, `"${raw}" is not a valid key token`);
  }
  return token;
}

function normalizeCode(raw: string): string {
  if (CODE_ALIASES[raw]) return CODE_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (lower.length === 4 && lower.startsWith('key')) {
    const letter = lower[3];
    if (letter >= 'a' && letter <= 'z') return letter;
  }
  if (lower.length === 6 && lower.startsWith('digit')) {
    const digit = lower[5];
    if (digit >= '0' && digit <= '9') return digit;
  }
  if (lower.length === 7 && lower.startsWith('numpad')) {
    const digit = lower[6];
    if (digit >= '0' && digit <= '9') return `numpad${digit}`;
  }
  return lower;
}
