import { createHistory } from "./history";
import type { HistoryView } from "./history";
import { createFixedClock, stepEnvelope, stepFixedClock } from "./signal";
import { STATE_TAU_MS, createStateWeights, stepStateWeights } from "./states";
import type { StateWeights, VisualState } from "./states";

export const SAMPLE_PERIOD_MS = 45;
export const HISTORY_CAPACITY = 512;
export const ATTACK_MS = 25;
export const RELEASE_MS = 250;
export const MAX_GAP_MS = 250;

export interface DisplayInput {
  readonly target: VisualState;
  readonly loudness: number;
  readonly bandTargets: ArrayLike<number> | null;
  readonly reducedMotion: boolean;
}

export interface Display {
  readonly level: number;
  readonly bands: Float32Array;
  readonly history: HistoryView;
  readonly weights: StateWeights;
  readonly ambientMs: number;
  step(input: DisplayInput, dtMs: number): void;
  setBandCount(n: number): void;
}

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
