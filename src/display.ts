import { createHistory } from "./history";
import type { HistoryView } from "./history";
import { createFixedClock, stepEnvelope, stepFixedClock } from "./signal";
import { STATE_TAU_MS, createStateWeights, stepStateWeights } from "./states";
import type { StateWeights, VisualState } from "./states";

export const SAMPLE_PERIOD_MS = 45;
export const HISTORY_CAPACITY = 512; // ~23 s of timeline
export const ATTACK_MS = 25;
export const RELEASE_MS = 250;
export const MAX_GAP_MS = 250; // a frame gap longer than this drops the clock backlog

export interface DisplayInput {
  readonly target: VisualState;
  /** 0..1 un-smoothed; 0 when there is no stream. */
  readonly loudness: number;
  /** 0..1 per band, length >= bandCount; null -> bands decay to 0. */
  readonly bandTargets: ArrayLike<number> | null;
  readonly reducedMotion: boolean;
}

export interface Display {
  /** Enveloped loudness. */
  readonly level: number;
  /** Enveloped, length === bandCount. */
  readonly bands: Float32Array;
  /** Enveloped level sampled every SAMPLE_PERIOD_MS. */
  readonly history: HistoryView;
  readonly weights: StateWeights;
  /** Advances with dt; frozen while reducedMotion. */
  readonly ambientMs: number;
  /** Advances every smoothing step by dtMs. Allocates nothing.
   *  A dtMs that is not a positive finite number changes nothing. */
  step(input: DisplayInput, dtMs: number): void;
  /** Reallocates bands (only when n changes); new bands start at 0. */
  setBandCount(n: number): void;
}

/** The one owner of every time-based smoothing step, so motion depends on elapsed
 *  milliseconds and never on how often `step` is called. */
export function createDisplay(bandCount: number, initial: VisualState): Display {
  let level = 0;
  let bands = new Float32Array(bandCount);
  let ambientMs = 0;
  const history = createHistory(HISTORY_CAPACITY);
  const clock = createFixedClock();
  const weights = createStateWeights(initial);

  return {
    get level() {
      return level;
    },
    get bands() {
      return bands;
    },
    get history() {
      return history;
    },
    get weights() {
      return weights;
    },
    get ambientMs() {
      return ambientMs;
    },
    step(input, dtMs) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) return;
      const { bandTargets } = input;
      if (bandTargets !== null && bandTargets.length < bands.length) {
        throw new RangeError(
          `display.step: bandTargets holds ${bandTargets.length} values but the display has ${bands.length} bands`,
        );
      }

      level = stepEnvelope(level, input.loudness, dtMs, ATTACK_MS, RELEASE_MS);
      for (let i = 0; i < bands.length; i++) {
        const target = bandTargets === null ? 0 : bandTargets[i];
        bands[i] = stepEnvelope(bands[i], target, dtMs, ATTACK_MS, RELEASE_MS);
      }

      const samples = stepFixedClock(clock, dtMs, SAMPLE_PERIOD_MS, MAX_GAP_MS);
      for (let i = 0; i < samples; i++) history.push(level);
      history.setPhase(clock.carryMs / SAMPLE_PERIOD_MS);

      stepStateWeights(weights, input.target, dtMs, input.reducedMotion ? 0 : STATE_TAU_MS);
      if (!input.reducedMotion) ambientMs += dtMs;
    },
    setBandCount(n) {
      if (n !== bands.length) bands = new Float32Array(n);
    },
  };
}
