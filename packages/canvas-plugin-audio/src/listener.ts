import type { AudioEngine } from '@openvtt/audio';
import type { PluginContext } from '@openvtt/canvas';

export type ListenerMode = 'camera' | 'token';

export type CoordinateMapper = (input: {
  x: number;
  y: number;
  gridSize: number;
  scale: number;
}) => { x: number; y: number; z: number };

export const gridMapper: CoordinateMapper = ({ x, y, gridSize }) => ({
  x: x / gridSize,
  y: 0,
  z: y / gridSize,
});

export class ListenerController {
  mode: ListenerMode = 'camera';
  tokenId: string | null = null;
  mapper: CoordinateMapper = gridMapper;

  setMode(mode: ListenerMode): void {
    this.mode = mode;
    if (mode === 'camera') this.tokenId = null;
  }

  followToken(tokenId: string | null): void {
    this.tokenId = tokenId;
    if (tokenId !== null) this.mode = 'token';
  }

  position(ctx: PluginContext): { x: number; y: number } | null {
    if (this.mode === 'token' && this.tokenId !== null) {
      const token = ctx.canvas.documents.layer('token')?.get(this.tokenId);
      if (token) return { x: token.x, y: token.y };
      return null;
    }
    return cameraCenter(ctx);
  }

  apply(ctx: PluginContext, engine: AudioEngine): void {
    const pos = this.position(ctx);
    if (pos === null) return;
    const gridSize = ctx.canvas.grid.size || 1;
    const scale = ctx.canvas.viewport?.scale ?? 1;
    const mapped = this.mapper({ x: pos.x, y: pos.y, gridSize, scale });
    engine.setListener(mapped.x, mapped.y, mapped.z);
  }
}

function cameraCenter(ctx: PluginContext): { x: number; y: number } | null {
  const viewport = ctx.canvas.viewport;
  if (!viewport) return null;
  const { screenWidth, screenHeight } = viewport.state;
  const center = viewport.toLocal({ x: screenWidth / 2, y: screenHeight / 2 });
  return { x: center.x, y: center.y };
}
