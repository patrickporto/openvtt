import { Ticker } from 'pixi.js';

export interface AnimationOptions {
  name?: string;
  duration: number;
  ease?: (t: number) => number;
  onUpdate: (progress: number, eased: number) => void;
  onComplete?: () => void;
}

export const Easing = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export class CanvasAnimation {
  private readonly ticker: Ticker;
  private readonly active = new Map<string, (ticker: Ticker) => void>();

  constructor(ticker: Ticker) {
    this.ticker = ticker;
  }

  animate(options: AnimationOptions): string {
    const name = options.name ?? `anim-${Math.random().toString(36).slice(2)}`;
    this.cancel(name);
    const ease = options.ease ?? Easing.inOutQuad;
    let elapsed = 0;
    const fn = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const progress = Math.min(1, elapsed / options.duration);
      options.onUpdate(progress, ease(progress));
      if (progress >= 1) {
        this.cancel(name);
        options.onComplete?.();
      }
    };
    this.active.set(name, fn);
    this.ticker.add(fn);
    return name;
  }

  cancel(name: string): void {
    const fn = this.active.get(name);
    if (!fn) return;
    this.ticker.remove(fn);
    this.active.delete(name);
  }

  cancelAll(): void {
    for (const fn of this.active.values()) this.ticker.remove(fn);
    this.active.clear();
  }

  get isActive(): boolean {
    return this.active.size > 0;
  }
}
