import { EventEmitter } from 'node:events';

export type BusEventType =
  | 'call'
  | 'incident'
  | 'approval'
  | 'audit'
  | 'seal'
  | 'server'
  | 'tool'
  | 'notification'
  | 'outbox'
  | 'ledger'
  | 'lab'
  | 'human_seal'
  | 'policy'
  | 'status'
  | 'log';

export interface BusEvent {
  type: BusEventType;
  ts: number;
  data: unknown;
}

class Bus extends EventEmitter {
  emitEvent(type: BusEventType, data: unknown) {
    this.emit('event', { type, ts: Date.now(), data } satisfies BusEvent);
  }
}

export const bus = new Bus();
bus.setMaxListeners(200);
