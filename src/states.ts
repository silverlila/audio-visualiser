export const VISUAL_STATES = ["idle", "connecting", "recording", "processing", "done", "error"] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

export type StateWeights = Readonly<Record<VisualState, number>>;

export const STATE_TAU_MS = 150;

export function createStateWeights(initial: VisualState): Record<VisualState, number> {
  const weights = { idle: 0, connecting: 0, recording: 0, processing: 0, done: 0, error: 0 };
  weights[initial] = 1;
  return weights;
}

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

export function defaultLabel(state: VisualState): string {
  return DEFAULT_LABELS[state];
}

export interface StateMix {
  signal: number;
  breathe: number;
  shimmer: number;
  rest: number;
}

export function createStateMix(): StateMix {
  return { signal: 0, breathe: 0, shimmer: 0, rest: 0 };
}

export function stateMix(w: StateWeights, out: StateMix): void {
  out.signal = w.recording;
  out.breathe = w.idle + w.connecting;
  out.shimmer = w.processing + 0.5 * w.connecting;
  out.rest = w.done + w.error;
}
