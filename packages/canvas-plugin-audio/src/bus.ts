import type { CanvasBus } from '@openvtt/canvas';
import type { SoundSource, SoundSourceInput } from './schemas';

export interface SoundSourcesPayload {
  sources: SoundSource[];
}

interface SoundsBusRuntime {
  tap(name: 'sound:sources', tapName: string, fn: (payload: SoundSourcesPayload) => SoundSourcesPayload): void;
  call(name: 'sound:sources', payload: { sources: SoundSourceInput[] }): SoundSourcesPayload;
}

export interface SoundsBusPort {
  tapSoundSources(tapName: string, fn: (payload: SoundSourcesPayload) => SoundSourcesPayload): void;
  callSoundSources(payload: { sources: SoundSourceInput[] }): SoundSourcesPayload;
}

export function soundsBus(bus: CanvasBus): SoundsBusPort {
  const runtime = bus as unknown as SoundsBusRuntime;
  return {
    tapSoundSources: (tapName, fn) => runtime.tap('sound:sources', tapName, fn),
    callSoundSources: (payload) => runtime.call('sound:sources', payload),
  };
}
