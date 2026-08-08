export interface DiceStyle {
  foreground: string | string[];
  background: string | string[];
  outline?: string | string[];
  edge?: string | string[];
  texture: string | string[];
  material: string;
  font: string;
  fontOffsetY?: number;
  labels?: Record<string, string[]>;
  /** Render numbers with an emissive map (glow with bloom) */
  emissive?: boolean;
  materialOptions?: {
    color?: number;
    roughness?: number;
    metalness?: number;
    envMapIntensity?: number;
  };
}

export interface DiceTheme {
  name: string;
  description?: string;
  author?: string;
  showColorPicker?: boolean;
  surface: string;
  category: string;
  dice: DiceStyle;
  d20?: Partial<DiceStyle>;
  boon?: Partial<DiceStyle>;
  bane?: Partial<DiceStyle>;
  /** 6 cube map faces [px, nx, py, ny, pz, nz], resolved against assetPath.
   *  Takes precedence over the global environment for dice using this theme. */
  cubeMap?: string[];
}

export const THEMES: Record<string, DiceTheme> = {
  'default': {
    name: 'Default',
    author: 'Patrick Porto',
    surface: 'wood_tray',
    category: 'RPG',
    dice: {
      foreground: '#fff',
      background: '#000',
      outline: '#fff',
      edge: '#000',
      texture: 'none',
      material: 'silk',
      font: 'Arial, system-ui',
      labels: {
        d6: ['1', '2', '3', '4', '5', '6'],
        d20: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']
      }
    },
    boon: {
      background: '#fff',
      foreground: '#000',
      edge: '#fff',
      outline: '#000',
    },
    bane: {
      background: '#b30511ff',
      foreground: '#fff',
      edge: '#b30511ff',
      outline: '#fff',
    },
  },
};
