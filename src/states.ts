export const VISUAL_STATES = ["idle", "connecting", "recording", "processing", "done", "error"] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

/** Each weight in [0,1]; they sum to 1. */
export type StateWeights = Readonly<Record<VisualState, number>>;

export const STATE_TAU_MS = 150;

/** One-hot weights for `initial`. */
export function createStateWeights(initial: VisualState): Record<VisualState, number> {
  const weights = { idle: 0, connecting: 0, recording: 0, processing: 0, done: 0, error: 0 };
  weights[initial] = 1;
  return weights;
}

/** Moves every weight toward one-hot(target): w = w * (1 - k) + onehot * k, k = 1 - exp(-dtMs/tauMs).
 *  Each new weight is a convex combination, so the sum stays 1 and each weight stays in [0,1].
 *  dtMs <= 0 changes nothing. tauMs <= 0 snaps (k = 1). */
export function stepStateWeights(
  w: Record<VisualState, number>,
  target: VisualState,
  dtMs: number,
  tauMs: number,
): void {
  if (dtMs <= 0) return;
  const k = tauMs <= 0 ? 1 : 1 - Math.exp(-dtMs / tauMs);
  for (const state of VISUAL_STATES) {
    const oneHot = state === target ? 1 : 0;
    w[state] = w[state] * (1 - k) + oneHot * k;
  }
}

const DEFAULT_LABELS: Readonly<Record<VisualState, string>> = {
  idle: "Audio visualiser, idle",
  connecting: "Connecting microphone",
  recording: "Recording audio",
  processing: "Processing audio",
  done: "Finished",
  error: "Audio error",
};

/** aria-label used when the caller passes none. */
export function defaultLabel(state: VisualState): string {
  return DEFAULT_LABELS[state];
}

/** The four ingredients every variant blends, derived from the weights. Each in [0,1].
 *  signal  = recording                      (live audio drives the shape)
 *  breathe = idle + connecting              (slow ambient pulse)
 *  shimmer = processing + 0.5 * connecting  (sweeping highlight)
 *  rest    = done + error                   (settled, flat) */
export interface StateMix {
  signal: number;
  breathe: number;
  shimmer: number;
  rest: number;
}

export function createStateMix(): StateMix {
  return { signal: 0, breathe: 0, shimmer: 0, rest: 0 };
}

/** Writes the mix of `w` into `out`. Allocates nothing. */
export function stateMix(w: StateWeights, out: StateMix): void {
  out.signal = w.recording;
  out.breathe = w.idle + w.connecting;
  out.shimmer = w.processing + 0.5 * w.connecting;
  out.rest = w.done + w.error;
}
