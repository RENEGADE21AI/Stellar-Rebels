import { newPilot, PilotStore } from '../../arcade/pilot.mjs';

let sequence = 0;
const pending = new Map();
const client = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

globalThis.stellarNativeReply = ({ id, client: recipient, ok, value }) => {
  if (recipient !== client) return;
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id);
  clearTimeout(request.timer);
  if (ok) request.resolve(value);
  else request.reject(Error('Device storage is unavailable'));
};

export function nativeRequest(op, data) {
  return new Promise((resolve, reject) => {
    const native = globalThis.ReactNativeWebView;
    if (!native) { reject(Error('Native host is unavailable')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('The native host did not respond'));
    }, op === 'share' ? 120_000 : 4000);
    pending.set(id, { resolve, reject, timer });
    native.postMessage(JSON.stringify({ id, client, documentUrl: location.href, op, data }));
  });
}

export class NativePilotStore extends PilotStore {
  constructor(preferences) {
    super(null, preferences);
    this.queue = Promise.resolve();
  }

  async open() {
    const wasTemporary = this.temporary;
    this.temporary = false;
    try {
      return (await this.change(() => undefined, wasTemporary ? this.session : null)).pilot;
    } catch (error) {
      this.temporary = wasTemporary;
      throw error;
    }
  }

  transact(operation, newSave = null) {
    if (this.temporary) return super.transact(operation, newSave);
    const task = this.queue.then(async () => {
      const initial = newPilot(this.preferences);
      const pilot = await nativeRequest('load') ?? newSave ?? initial;
      if (pilot.schema !== initial.schema) throw Error('This device save requires a different game version');
      const result = operation?.(pilot);
      if (operation) await nativeRequest('save', pilot);
      this.session = pilot;
      return { pilot, result };
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
