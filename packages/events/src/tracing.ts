import { v7 as uuidv7 } from 'uuid';

export type EventOrigin = 'local' | 'broadcast' | 'bridge';

export interface EventMeta {
  readonly id: string;
  readonly name: string;
  readonly wireName: string;
  readonly namespace: string;
  readonly timestamp: number;
  readonly origin: EventOrigin;
  readonly correlationId?: string;
  readonly source?: string;
}

export interface EmitOptions {
  origin?: EventOrigin;
  correlationId?: string;
  source?: string;
  timestamp?: number;
  skipBroadcast?: boolean;
  skipBridge?: boolean;
}

export function newId(): string {
  return uuidv7();
}

export function createMeta(
  name: string,
  wireName: string,
  namespace: string,
  options: EmitOptions = {},
): EventMeta {
  return {
    id: newId(),
    name,
    wireName,
    namespace,
    timestamp: options.timestamp ?? Date.now(),
    origin: options.origin ?? 'local',
    correlationId: options.correlationId,
    source: options.source,
  };
}
