import type { CollideEvent } from '@openvtt/physics';
import { ANIMATION } from '../constants/animation';

export const SURFACE_COUNTS: Record<string, number> = {
  felt: 7,
  wood_table: 7,
  wood_tray: 7,
  metal: 9,
};

export const DIE_MATERIAL_COUNTS: Record<string, number> = {
  coin: 6,
  metal: 12,
  plastic: 15,
  wood: 12,
};

export class SoundManager {
  surface = 'wood_tray';
  dieMaterial = 'plastic';
  enabled = false;
  volume = 100;
  resolver: (url: string) => string = (url) => url;

  #assetPath: string;
  #table = new Map<string, HTMLAudioElement[]>();
  #dice = new Map<string, HTMLAudioElement[]>();
  #lastSound = 0;
  #lastType = '';
  #lastStep = 0;

  constructor(assetPath: string) {
    this.#assetPath = assetPath;
  }

  setAssetPath(assetPath: string): void {
    this.#assetPath = assetPath;
  }

  resolveDieMaterial(textureMaterial?: string): string {
    const match = textureMaterial?.match(/wood|metal/g);
    return match ? textureMaterial! : 'plastic';
  }

  async load(): Promise<void> {
    if (!this.#table.has(this.surface)) {
      const count = SURFACE_COUNTS[this.surface] ?? 7;
      this.#table.set(
        this.surface,
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            this.loadAudio(this.resolver(`${this.#assetPath}sounds/surfaces/surface_${this.surface}${i + 1}.mp3`))
          )
        )
      );
    }

    const loadDieSet = async (material: string) => {
      if (this.#dice.has(material)) return;
      const count = DIE_MATERIAL_COUNTS[material] ?? 6;
      this.#dice.set(
        material,
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            this.loadAudio(this.resolver(`${this.#assetPath}sounds/dicehit/dicehit_${material}${i + 1}.mp3`))
          )
        )
      );
    };

    await Promise.all([loadDieSet('coin'), loadDieSet(this.dieMaterial)]);
  }

  loadAudio(src: string): Promise<HTMLAudioElement> {
    return new Promise<HTMLAudioElement>((resolve, reject) => {
      const audio = new Audio();
      const timeout = setTimeout(() => reject(new Error(`Audio load timeout: ${src}`)), 15000);
      audio.oncanplaythrough = () => {
        clearTimeout(timeout);
        resolve(audio);
      };
      audio.crossOrigin = 'anonymous';
      audio.src = src;
      audio.onerror = (error) => {
        clearTimeout(timeout);
        reject(error as unknown as Error);
      };
    });
  }

  playCollideEvents(events: CollideEvent[], muted: boolean): void {
    if (!this.enabled || this.volume <= 0 || muted) return;

    const now = Date.now();
    for (const event of events) {
      const currentType = event.isBody ? 'dice' : 'table';

      if ((this.#lastStep == event.step || this.#lastSound > now) && currentType != 'dice') continue;
      if (
        (this.#lastStep == event.step || this.#lastSound > now) &&
        currentType == 'dice' &&
        this.#lastType == 'dice'
      ) continue;

      if (event.speed < ANIMATION.MIN_SOUND_SPEED) continue;

      if (event.isBody) {
        const material = event.shapeTag === 'd2' ? 'coin' : this.dieMaterial;
        this.#playFrom(this.#dice.get(material) ?? this.#dice.get('plastic'), event.speed);
        this.#lastType = 'dice';
      } else {
        this.#playFrom(this.#table.get(this.surface), event.speed);
        this.#lastType = 'table';
      }

      this.#lastStep = event.step;
      this.#lastSound = now + ANIMATION.SOUND_DELAY;
    }
  }

  #playFrom(list: HTMLAudioElement[] | undefined, speed: number): void {
    if (!list?.length) return;
    const sound = list[Math.floor(Math.random() * list.length)];
    if (!sound) return;
    sound.volume = Math.min(speed / ANIMATION.SOUND_VOLUME_DIVIDER, this.volume / 100);
    sound.play().catch(() => undefined);
  }

  dispose(): void {
    this.#table.clear();
    this.#dice.clear();
  }
}
