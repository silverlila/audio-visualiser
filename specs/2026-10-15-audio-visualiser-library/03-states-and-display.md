# 03 — State vocabulary, blending, and `display.ts`

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC6
- **You will see**: `pnpm test` shows that state changes cross-fade with weights that always sum to
  1, that reduced motion snaps them, and that the timeline history fills at the same rate on 60 Hz
  and 120 Hz displays.

## Goal

Add `src/states.ts` (the six states and how they blend) and `src/display.ts` (the one module that
owns every time-based smoothing step). After this unit, all the per-frame maths the visualiser
needs exists and is tested in Node. Unit 05 only wires it to Web Audio and a canvas.

## Files

- `src/states.ts` (new)
- `src/states.test.ts` (new)
- `src/display.ts` (new)
- `src/display.test.ts` (new)
- `src/index.ts`: add `export { VISUAL_STATES } from "./states"; export type { VisualState } from "./states";`

## Changes

### 1. `src/states.ts`

```ts
export const VISUAL_STATES = ["idle", "connecting", "recording", "processing", "done", "error"] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

/** Each weight in [0,1]; they sum to 1. */
export type StateWeights = Readonly<Record<VisualState, number>>;

export const STATE_TAU_MS = 150;

/** One-hot weights for `initial`. */
export function createStateWeights(initial: VisualState): Record<VisualState, number>;
/** Moves every weight toward one-hot(target): w += (onehot - w) * k, k = 1 - exp(-dtMs/tauMs).
 *  tauMs <= 0 snaps (k = 1). This keeps the sum at 1 by construction. */
export function stepStateWeights(w: Record<VisualState, number>, target: VisualState, dtMs: number, tauMs: number): void;

/** aria-label used when the caller passes none. */
export function defaultLabel(state: VisualState): string;
// idle "Audio visualiser, idle", connecting "Connecting microphone", recording "Recording audio",
// processing "Processing audio", done "Finished", error "Audio error"

/** The four ingredients every variant blends, derived from the weights. Each in [0,1].
 *  signal  = recording                      (live audio drives the shape)
 *  breathe = idle + connecting              (slow ambient pulse)
 *  shimmer = processing + 0.5 * connecting  (sweeping highlight)
 *  rest    = done + error                   (settled, flat) */
export interface StateMix { signal: number; breathe: number; shimmer: number; rest: number }
export function stateMix(w: StateWeights, out: StateMix): void;    // writes into out, allocates nothing
export function createStateMix(): StateMix;
```

`stateMix` lives here so that variants (unit 05 and unit 07) never write per-state `switch`
statements. This one table is the only place that maps states to looks.

### 2. `src/display.ts`

```ts
import type { HistoryView } from "./history";
import type { StateWeights, VisualState } from "./states";

export const SAMPLE_PERIOD_MS = 45;
export const HISTORY_CAPACITY = 512;   // ~23 s of timeline
export const ATTACK_MS = 25;
export const RELEASE_MS = 250;
export const MAX_GAP_MS = 250;         // a frame gap longer than this drops the clock backlog

export interface DisplayInput {
  readonly target: VisualState;
  readonly loudness: number;                      // 0..1 un-smoothed; 0 when there is no stream
  readonly bandTargets: ArrayLike<number> | null; // 0..1 per band, length >= bandCount; null -> bands decay to 0
  readonly reducedMotion: boolean;
}

export interface Display {
  readonly level: number;             // enveloped loudness
  readonly bands: Float32Array;       // enveloped, length === bandCount
  readonly history: HistoryView;      // enveloped level sampled every SAMPLE_PERIOD_MS
  readonly weights: StateWeights;
  readonly ambientMs: number;         // advances with dt; frozen while reducedMotion
  step(input: DisplayInput, dtMs: number): void;
  /** Reallocates bands (only when n changes); new bands start at 0. */
  setBandCount(n: number): void;
}

export function createDisplay(bandCount: number, initial: VisualState): Display;
```

`step` order. It allocates nothing, and `dtMs <= 0` changes nothing:
1. `level = stepEnvelope(level, input.loudness, dt, ATTACK_MS, RELEASE_MS)`.
2. For each band `i < bandCount`, `bands[i] = stepEnvelope(bands[i], bandTargets?.[i] ?? 0, dt, ATTACK_MS, RELEASE_MS)`.
3. `n = stepFixedClock(clock, dt, SAMPLE_PERIOD_MS, MAX_GAP_MS)`, then push `level` `n` times. After that, `history.setPhase(clock.carryMs / SAMPLE_PERIOD_MS)`.
4. `stepStateWeights(weights, target, dt, reducedMotion ? 0 : STATE_TAU_MS)`.
5. Unless `reducedMotion`, `ambientMs += dt`.

Expose `level`, `ambientMs` and the rest as getters over closure variables, so the same `Display`
object stays valid and readable while it mutates.

### 3. Tests: the names are part of AC6, keep them verbatim

`src/states.test.ts`:
- `state weights sum to 1 throughout a transition`: start `idle`, target `processing`, 60 steps of 16 ms. After each step the sum is within 1e-9 of 1 and every weight is in [0,1].
- `an interrupted transition does not snap`: go idle→recording for 50 ms, then target `done`. The `recording` weight after one more 16 ms step is lower than before but still above 0.
- `stateMix derives signal, breathe, shimmer and rest`

`src/display.test.ts`:
- `history fills at the same rate at 60 Hz and 120 Hz`: two displays fed constant loudness 0.5 for 2000 ms, one at 16.667 ms steps and one at 8.333 ms steps. `history.length` is equal ±1.
- `level attacks fast and releases slowly`: from 0, loudness 1 for 50 ms gives level > 0.8. Then loudness 0 for 50 ms gives level > 0.5.
- `reduced motion snaps weights and freezes ambient`
- `bands decay to 0 without targets`
- `step with dt 0 changes nothing`

## Verify

```sh
pnpm test && pnpm typecheck && pnpm lint
```
