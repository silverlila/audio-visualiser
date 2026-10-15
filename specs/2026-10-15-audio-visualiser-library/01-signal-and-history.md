# 01 — Signal maths and history ring buffer

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC4
- **You will see**: `pnpm test` runs a Vitest suite showing that loudness now comes from RMS in dB
  (bug 1) and that history ticks by elapsed time, the same at 60 Hz and 120 Hz (bug 2).

## Goal

Add Vitest and the two pure modules every later unit builds on: `src/signal.ts` (what the numbers
mean) and `src/history.ts` (the time axis). Nothing in the app uses them yet. Unit 05 wires them in.
The existing app files stay untouched in this unit.

## Files

- `package.json`: add the `vitest` dev dependency and the scripts `"test": "vitest run"` and `"typecheck": "tsc -b"`.
- `vitest.config.ts` (new): the test config.
- `tsconfig.node.json`: add `vitest.config.ts` to `include`.
- `src/signal.ts` (new)
- `src/signal.test.ts` (new)
- `src/history.ts` (new)
- `src/history.test.ts` (new)

## Changes

### 1. Vitest

Run `pnpm add -D vitest@~5.0.3`. Vitest 5.0.x declares the peer dependency `vite: ^6.4.0 || ^7.0.0 || ^8.0.0`, and this repo has Vite 7.

Create `vitest.config.ts` as a separate file. Do not put the test config in `vite.config.ts`: unit 02
sets `root: "playground"` there, which would hide `src/` tests.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "playground/**/*.test.ts"],
    environment: "node",
  },
});
```

`tsconfig.node.json` `include` becomes `["vite.config.ts", "vitest.config.ts"]`.

### 2. `src/signal.ts`: exact signatures

```ts
export interface DbRange { readonly floorDb: number; readonly ceilingDb: number }

/** RMS dBFS of a mic signal. Below the floor reads as silence. */
export const LOUDNESS_RANGE: DbRange = { floorDb: -60, ceilingDb: -10 };
/** Scale of AnalyserNode.getFloatFrequencyData (dB, different reference). */
export const SPECTRUM_RANGE: DbRange = { floorDb: -100, ceilingDb: -30 };
export const BAND_MIN_HZ = 80;
export const BAND_MAX_HZ = 8000;

export function rms(samples: ArrayLike<number>): number;          // sqrt(mean(x^2)); empty -> 0
export function amplitudeToDb(amplitude: number): number;         // 20*log10(a); 0 -> -Infinity
export function normalizeDb(db: number, range: DbRange): number;  // (db-floor)/(ceil-floor) clamped to [0,1]; -Infinity and NaN -> 0

/** Time-constant smoothing: current + (target-current) * (1 - exp(-dtMs/tau)),
 *  tau = attackMs when target > current, else releaseMs. dtMs <= 0 returns current.
 *  tau <= 0 returns target. */
export function stepEnvelope(current: number, target: number, dtMs: number, attackMs: number, releaseMs: number): number;

/** Band i covers FFT bins [startBin[i], endBin[i]); endBin[i] > startBin[i] always.
 *  Low bands may share a bin when the bin is wider than the band. */
export interface BandLayout { readonly count: number; readonly startBin: Uint16Array; readonly endBin: Uint16Array }
export function logBandLayout(count: number, minHz: number, maxHz: number, sampleRate: number, fftSize: number): BandLayout;

/** Writes layout.count values in 0..1 into out[0..count). Per band: mean of linear power
 *  (10^(dB/10)) over its bins -> back to dB -> normalizeDb(SPECTRUM_RANGE). Allocates nothing. */
export function measureBands(spectrumDb: ArrayLike<number>, layout: BandLayout, out: Float32Array): void;

export interface FixedClock { carryMs: number }
export function createFixedClock(): FixedClock;                  // { carryMs: 0 }
/** Adds dtMs to carry and returns how many whole periods elapsed, keeping the remainder.
 *  dtMs > maxGapMs (tab was hidden, debugger pause) -> returns 0 and resets carry to 0:
 *  the backlog is dropped, never replayed. dtMs <= 0 -> 0. */
export function stepFixedClock(clock: FixedClock, dtMs: number, periodMs: number, maxGapMs: number): number;
```

`logBandLayout` algorithm:
- `binHz = sampleRate / fftSize`, and `binCount = fftSize / 2`.
- For edges `i = 0..count`, `hz_i = minHz * (maxHz/minHz)^(i/count)` and `bin_i = clamp(round(hz_i / binHz), 1, binCount - 1)`. Bin 0 is DC, so it is skipped.
- `startBin[i] = bin_i`, and `endBin[i] = max(bin_{i+1}, startBin[i] + 1)`, clamped to `binCount`. If that clamp makes `endBin <= startBin` at the top, set `startBin[i] = endBin[i] - 1`.

### 3. `src/history.ts`: exact signatures

```ts
export interface HistoryView {
  readonly length: number;          // number of samples pushed so far, capped at capacity
  /** 0 = newest. Ages outside [0, length) return 0, so renderers never bounds-check. */
  at(age: number): number;
  /** 0..1 of the current sample period elapsed: sub-sample scroll offset for renderers. */
  readonly phase: number;
}
export interface History extends HistoryView {
  push(value: number): void;
  setPhase(phase: number): void;    // clamped to [0,1)
  clear(): void;                    // length 0, phase 0
}
export function createHistory(capacity: number): History;
```

Back it with one `Float32Array(capacity)` and a write index. `at(age)` reads
`buffer[(write - 1 - age + capacity) % capacity]`. Nothing allocates after construction. Write the
methods as closures over local variables, not as a class using `this`, so they can be passed around
unbound.

### 4. Tests: the names are part of AC4, keep them verbatim

`src/signal.test.ts`:
- `rms of a full-scale sine is 1/sqrt(2)`: 4800 samples of `sin(2π·440·n/48000)`, `toBeCloseTo(Math.SQRT1_2, 3)`.
- `rms of silence is 0 and amplitudeToDb(0) is -Infinity`
- `normalizeDb clamps to 0..1`: floor maps to 0, ceiling to 1, midpoint to 0.5, below the floor to 0, above the ceiling to 1, `-Infinity` to 0.
- `stepEnvelope result depends on elapsed time, not call count`: one step of 32 ms equals two steps of 16 ms, to 1e-9.
- `stepEnvelope attacks faster than it releases`
- `logBandLayout gives every band at least one bin`: for `count` in {5, 8, 32, 48} at 48000/2048 and 44100/2048, every `endBin > startBin` and starts never decrease.
- `measureBands maps a flat spectrum at the ceiling to 1 and at the floor to 0`
- `stepFixedClock ticks the same at 60 Hz and 120 Hz`: one second at 16.667 ms steps and one second at 8.333 ms steps give the same total ticks (22 for a 45 ms period, ±1).
- `stepFixedClock drops the backlog after a long gap`

`src/history.test.ts`:
- `history at(age) returns newest first and wraps`: capacity 4, push 1..6, then `at(0)=6`, `at(3)=3`, `at(4)=0`, `length=4`.
- `history clear resets length and phase`

## Verify

```sh
pnpm test && pnpm typecheck
```

The Vitest output lists the test names above.

## Watch out

- `tsc -b` still type-checks the old `src/useAudioVisualiser.tsx` and friends through
  `tsconfig.app.json`. That is expected, and they still compile. Do not touch them here.
- Don't run `pnpm lint` as this unit's gate. It already reports one warning on
  `src/useSpeechToText.tsx`, and unit 02 fixes it.
