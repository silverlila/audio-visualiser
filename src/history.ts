export interface HistoryView {
  /** Number of samples pushed so far, capped at capacity. */
  readonly length: number;
  /** Integer age, 0 = newest. Ages outside [0, length) return 0, so renderers never bounds-check. */
  at(age: number): number;
  /** 0..1 of the current sample period elapsed: sub-sample scroll offset for renderers. */
  readonly phase: number;
}

export interface History extends HistoryView {
  push(value: number): void;
  /** Clamped to [0, 1). */
  setPhase(phase: number): void;
  /** Length 0, phase 0. */
  clear(): void;
}

/** The largest double below 1, so a clamped phase never reads as a whole period. */
const MAX_PHASE = 1 - Number.EPSILON / 2;

/** A fixed-capacity ring buffer of levels. Nothing allocates after construction. */
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
