import { defineRangeTheme } from './schemas';

export const SPECTRUM_THEME = defineRangeTheme({
  id: 'spectrum',
  label: 'Spectrum',
  colors: ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'],
});

export const DEUTERANOPIA_THEME = defineRangeTheme({
  id: 'deuteranopia',
  label: 'Deuteranopia',
  colors: ['#2563eb', '#f97316', '#eab308', '#f8fafc'],
});

export const PROTANOPIA_THEME = defineRangeTheme({
  id: 'protanopia',
  label: 'Protanopia',
  colors: ['#1d4ed8', '#fb923c', '#fde047', '#e5e7eb'],
});

export const TRITANOPIA_THEME = defineRangeTheme({
  id: 'tritanopia',
  label: 'Tritanopia',
  colors: ['#ef4444', '#ec4899', '#f97316', '#fafaf9'],
});

export const BUILTIN_THEMES: readonly (typeof SPECTRUM_THEME | typeof DEUTERANOPIA_THEME | typeof PROTANOPIA_THEME | typeof TRITANOPIA_THEME)[] = [
  SPECTRUM_THEME,
  DEUTERANOPIA_THEME,
  PROTANOPIA_THEME,
  TRITANOPIA_THEME,
];
