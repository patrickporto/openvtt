import type { EmitOptions } from './tracing';

export interface BroadcastMessage {
  readonly v: 1;
  readonly namespace: string;
  readonly name: string;
  readonly payload: unknown;
  readonly correlationId: string;
  readonly sourceId: string;
  readonly timestamp: number;
}

export interface BroadcastOptions {
  channel?: string;
}

export interface BroadcastHandlers {
  readonly namespace: string;
  readonly sourceId: string;
  onMessage(message: BroadcastMessage): void;
}

export class Broadcast {
  private channel: BroadcastChannel | undefined;
  private readonly handlers: BroadcastHandlers;

  constructor(handlers: BroadcastHandlers, options: BroadcastOptions = {}) {
    this.handlers = handlers;
    if (typeof BroadcastChannel !== 'undefined') {
      const name = options.channel ?? `openvtt:${handlers.namespace}`;
      this.channel = new BroadcastChannel(name);
      this.channel.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (this.isValid(data) && data.sourceId !== handlers.sourceId) {
          handlers.onMessage(data);
        }
      };
    }
  }

  get enabled(): boolean {
    return this.channel !== undefined;
  }

  post(name: string, payload: unknown, options: Pick<EmitOptions, 'correlationId' | 'timestamp'>): void {
    if (!this.channel) return;
    const message: BroadcastMessage = {
      v: 1,
      namespace: this.handlers.namespace,
      name,
      payload,
      correlationId: options.correlationId ?? '',
      sourceId: this.handlers.sourceId,
      timestamp: options.timestamp ?? Date.now(),
    };
    try {
      this.channel.postMessage(message);
    } catch {
      // structured clone may fail on non-cloneable payloads; ignore
    }
  }

  close(): void {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = undefined;
    }
  }

  private isValid(data: unknown): data is BroadcastMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      (data as BroadcastMessage).v === 1 &&
      typeof (data as BroadcastMessage).name === 'string' &&
      typeof (data as BroadcastMessage).namespace === 'string' &&
      typeof (data as BroadcastMessage).sourceId === 'string'
    );
  }
}
