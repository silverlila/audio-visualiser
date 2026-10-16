export interface HistoryView {
  readonly length: number;
  at(age: number): number;
  readonly phase: number;
}

export interface History extends HistoryView {
  push(value: number): void;
  setPhase(phase: number): void;
  clear(): void;
}

const MAX_PHASE = 1 - Number.EPSILON / 2;

export function createHistory(capacity: number): History {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`createHistory: capacity must be a positive integer, got ${capacity}`);
  }
  const buffer = new Float32Array(capacity);
  let write = 0;
  let length = 0;
  let phase = 0;

  return {
    get length() {
      return length;
    },
    get phase() {
      return phase;
    },
    at(age) {
      if (age < 0 || age >= length) return 0;
      return buffer[(write - 1 - age + capacity) % capacity];
    },
    push(value) {
      buffer[write] = value;
      write = (write + 1) % capacity;
      length = Math.min(length + 1, capacity);
    },
    setPhase(next) {
      if (Number.isNaN(next) || next <= 0) phase = 0;
      else phase = Math.min(next, MAX_PHASE);
    },
    clear() {
      write = 0;
      length = 0;
      phase = 0;
    },
  };
}
