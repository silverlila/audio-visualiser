# 05 — Visualiser core and the `timeline` variant

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC8, AC13
- **You will see**: `pnpm dev`, then click Start. A crisp, full-height timeline scrolls smoothly and
  follows your voice's loudness, vowels included. It looks the same in dark mode, Stop clears it,
  and clicking Start twice leaves a single mic indicator.
- **Skills**: `performance`, `animations`
- **Checkpoint**: `pnpm dev` → open `http://localhost:5173/`, click Start and speak. Do the bars
  follow loudness, scroll smoothly, look crisp on a Retina display and fill the height?

## Goal

Build the browser half of the core: the shared audio graph, the canvas surface, the per-canvas
frame loop, and the first variant (`timeline`). The playground drops the old hook and uses
`createMicrophone` + `createVisualiser` directly through a small effect. Unit 06 replaces that
effect with the React binding. After this unit the old hook is gone.

## Files

- `src/audio-graph.ts` (new)
- `src/surface.ts` (new)
- `src/variants/frame.ts` (new)
- `src/variants/draw.ts` (new)
- `src/variants/timeline.ts` (new)
- `src/variants/index.ts` (new)
- `src/visualiser.ts` (new)
- `src/index.ts`: replace with the real public surface (change 6).
- `playground/App.tsx`: use the core directly (change 7).
- `playground/useAudioVisualiser.ts`: **delete**.

## Changes

### 1. `src/audio-graph.ts`

```ts
export const FFT_SIZE = 2048;
export interface AnalyserTap {
  readonly sampleRate: number;
  readonly fftSize: number;
  /** Fills preallocated buffers: waveform length FFT_SIZE, spectrumDb length FFT_SIZE/2. */
  read(waveform: Float32Array<ArrayBuffer>, spectrumDb: Float32Array<ArrayBuffer>): void;
  /** Idempotent. Disconnects this tap's nodes. Never closes the shared context. */
  release(): void;
}
export function tapStream(stream: MediaStream): AnalyserTap;
```

How it works:
- One module-level `let context: AudioContext | null = null`, created lazily on the first `tapStream` call and **never closed**. This makes bug 4 impossible.
- Each tap builds `context.createMediaStreamSource(stream)` → `AnalyserNode` (`fftSize = FFT_SIZE`, `smoothingTimeConstant = 0`, because `display.ts` does all smoothing) → `GainNode` with gain 0 → `context.destination`. The silent sink keeps the graph pulled in Safari.
- A module-level `liveTaps` counter: tapping increments it, and releasing decrements it, calling `void context.suspend()` when it reaches 0.
- When tapping, if `context.state === "suspended"`, call `void context.resume()`. Also add one-shot `pointerdown` and `keydown` listeners on `window` (`{ once: true, capture: true }`) that call `resume()`. This is the autoplay fallback: Safari may keep a context created after `await getUserMedia` suspended until the next gesture.

### 2. `src/surface.ts`

```ts
import type { VisualState } from "./states";
export interface Surface {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number; readonly height: number;   // CSS px, from the ResizeObserver
  readonly active: boolean;                          // document visible && canvas intersecting && width*height > 0
  readonly reducedMotion: boolean;
  /** Live computed style: ink = `color`, accent = `--av-accent` trimmed, or ink when empty. Reused object. */
  readColors(): { readonly ink: string; readonly accent: string };
  /** If the backing store differs from round(css * dpr), resize it; then setTransform(dpr,0,0,dpr,0,0) and clearRect. */
  beginFrame(): void;
  /** Writes role="img", aria-label, data-state — only when they differ from the current values. */
  setAccessibility(state: VisualState, label: string): void;
  clear(): void;
  /** Idempotent. Disconnects observers and listeners, clears, removes role/aria-label/data-state and the inline contain. */
  dispose(): void;
}
/** Throws Error("audio-visualiser: canvas has no 2D context") if getContext("2d") is null. */
export function createSurface(canvas: HTMLCanvasElement, onActiveChange: () => void): Surface;
```

- **Size.** Use a `ResizeObserver`. Observe with `{ box: "device-pixel-content-box" }` inside
  `try`. Safari does not support it and throws, so fall back to `content-box`. Backing pixels come
  from `devicePixelContentBoxSize[0]` when present, otherwise from
  `round(contentBoxSize[0].inlineSize * devicePixelRatio)`.
- **Feedback guard.** Set `canvas.style.contain = "size"`. A canvas without CSS size would
  otherwise grow every time its backing store is resized. With size containment it falls back to
  the default object size and never feeds back into layout.
- **Activity.** An `IntersectionObserver` and `document.visibilitychange` decide `active`. Call
  `onActiveChange` whenever it flips.
- **Reduced motion.** Read `matchMedia("(prefers-reduced-motion: reduce)")` and listen for
  changes.

### 3. `src/variants/frame.ts`, `draw.ts`, `index.ts`

```ts
// frame.ts — internal renderer contract (not exported from src/index.ts)
import type { HistoryView } from "../history";
import type { StateMix, StateWeights, VisualState } from "../states";
/** Valid only during one draw() call; the object is reused every frame. */
export interface Frame {
  readonly width: number; readonly height: number;   // CSS px; ctx is DPR-scaled and cleared
  readonly ink: string; readonly accent: string;
  readonly level: number;                            // 0..1 enveloped
  readonly bands: ArrayLike<number>;                 // 0..1, length === variant.bands
  readonly waveform: ArrayLike<number>;              // -1..1, zeros when no stream
  readonly history: HistoryView;
  readonly state: VisualState;                       // target state, for discrete things
  readonly weights: StateWeights;
  readonly mix: StateMix;                            // stateMix(weights)
  readonly ambientMs: number;                        // frozen under reduced motion
}
export interface Variant {
  readonly bands: number;    // 0 = the variant reads no bands, so the FFT read is skipped
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void;
}
```

- `draw.ts`: `roundedBar(ctx, x, y, w, h)`, a filled rect with radius `min(w, h) / 2` using
  `ctx.roundRect`. Also `shimmerAlpha(position01, ambientMs, strength)`, which returns 0..1 for a
  highlight sweeping left to right once every 1600 ms.
- `index.ts`: `export const VARIANTS = ["timeline"] as const;`,
  `export type VariantName = (typeof VARIANTS)[number];`, and
  `export const RENDERERS = { timeline } satisfies Record<VariantName, Variant>;`. Unit 07 extends
  both.

### 4. `src/variants/timeline.ts`

This is the Superwhisper-style scrolling bar history, with `bands: 0`.
- Bars are 3 CSS px wide on a 5 px step, vertically centred, with rounded caps.
- The newest bar sits at the right edge. Every bar is shifted left by `history.phase * step` so the
  scroll is continuous. The bar count is `ceil(width / step) + 1`, read with `history.at(age)`.
- Height is `minH + value * (height - minH) * mix.signal`, with `minH = 2`. Full height is
  reachable, which fixes the old half-height bug.
- `breathe` adds `0.15 * height * (0.5 + 0.5 * sin(ambientMs / 600 + i * 0.35)) * mix.breathe` to
  each bar.
- `shimmer` sets per-bar alpha `0.35 + 0.65 * shimmerAlpha(x / width, ambientMs, mix.shimmer)`.
  With no shimmer, alpha is 1.
- `rest` blends heights toward `minH`.
- Fill with `frame.ink`. The colour is never hard-coded.

### 5. `src/visualiser.ts`

```ts
import type { VisualState } from "./states";
import type { VariantName } from "./variants";
export interface VisualiserOptions {
  readonly stream?: MediaStream | null;   // the caller owns it; never stopped here
  readonly state?: VisualState;           // default: "recording" when stream is set, else "idle"
  readonly variant?: VariantName;         // default "timeline"
  readonly label?: string;                // default defaultLabel(resolved state)
}
export interface Visualiser {
  /** Replaces all options (omitted -> default). Equal values are no-ops. Throws Error("audio-visualiser: update() after destroy()") after destroy. */
  update(options?: VisualiserOptions): void;
  /** Idempotent: releases the tap, cancels rAF, disposes the surface. */
  destroy(): void;
}
export function createVisualiser(canvas: HTMLCanvasElement, options?: VisualiserOptions): Visualiser;
```

- **Setup.** Allocate everything once:
  - `createSurface`
  - `createDisplay(RENDERERS[variant].bands, state)`
  - `waveform = new Float32Array(FFT_SIZE)` and `spectrumDb = new Float32Array(FFT_SIZE / 2)`
  - `bandTargets`
  - one mutable `Frame`-shaped object and one `StateMix`
- **`update`.** Resolve the defaults first.
  - If the stream identity changed, release the old tap. Then tap the new stream, or set `tap = null` and zero `waveform` when the stream is null.
  - If the variant changed, call `display.setBandCount`. Rebuild `layout = logBandLayout(bands, BAND_MIN_HZ, BAND_MAX_HZ, tap.sampleRate, tap.fftSize)` when the band count or the tap's sample rate changes.
  - Always call `surface.setAccessibility(state, label)`.
- **Frame loop.** `requestAnimationFrame(frame)`, only while `surface.active`. Set
  `dt = lastTime === null ? 0 : now - lastTime`. When the surface turns inactive, cancel the rAF.
  When it turns active again, set `lastTime = null` so there is no catch-up. Each frame:
  1. If a tap exists, call `tap.read(waveform, spectrumDb)` and compute
     `loudness = normalizeDb(amplitudeToDb(rms(waveform)), LOUDNESS_RANGE)`. Otherwise
     `loudness = 0`.
  2. When the variant has bands and a tap exists, call
     `measureBands(spectrumDb, layout, bandTargets)`. Otherwise pass `null`.
  3. Call `display.step({ target, loudness, bandTargets, reducedMotion }, dt)`.
  4. Call `surface.beginFrame()`.
  5. Fill the frame fields, including `stateMix(display.weights, mix)` and the colours from
     `surface.readColors()`.
  6. Call `RENDERERS[variant].draw(surface.ctx, frame)`.
- **`destroy`.** Set a `destroyed` flag. A second call returns immediately. Cancel the rAF,
  `tap?.release()`, `surface.dispose()` (which clears the canvas, fixing the stale last frame from
  bug 5).

### 6. `src/index.ts`: the public surface

```ts
export { createVisualiser } from "./visualiser";
export type { Visualiser, VisualiserOptions } from "./visualiser";
export { createMicrophone, microphoneVisualState } from "./microphone";
export type { Microphone, MicrophoneOptions, MicrophoneSnapshot, MicrophoneError, MicrophoneErrorKind, MicrophoneDevice } from "./microphone";
export { VISUAL_STATES } from "./states";
export type { VisualState } from "./states";
export { VARIANTS } from "./variants";
export type { VariantName } from "./variants";
```

The `signal` and `history` re-exports from unit 02 are removed. They are internal.

### 7. `playground/App.tsx`

Replace the old hook with the core:
- `const [mic] = useState(() => createMicrophone())`.
- Subscribe in an effect.
- Create the visualiser on the canvas in an effect with cleanup `destroy()`, and call
  `vis.update({ stream: snap.stream, state: microphoneVisualState(snap), variant: "timeline" })` on
  every snapshot.
- Start and Stop buttons call `mic.start()` and `mic.stop()`, alongside the speech hook.
- Show `snap.error.message` when it is present.
- Give the canvas CSS size, e.g. `style={{ width: "100%", height: 64, color: "CanvasText" }}`.
- Delete `playground/useAudioVisualiser.ts`.

### 8. `src/visualiser.test.ts` (AC13)

First line `// @vitest-environment jsdom`. jsdom has no 2D context, `ResizeObserver`,
`IntersectionObserver`, `matchMedia` or `AudioContext`, so fake them at that boundary:
- `vi.spyOn(HTMLCanvasElement.prototype, "getContext")` returns a fake object implementing the
  `CanvasRenderingContext2D` methods used (`setTransform`, `clearRect`, `fillRect`, `roundRect`,
  `beginPath`, `fill`, `save`, `restore`, …). Use no-op `vi.fn()`s.
- `vi.stubGlobal` provides `ResizeObserver`, `IntersectionObserver` (classes with
  `observe`/`disconnect`), `matchMedia` (returning `{ matches: false, addEventListener, removeEventListener }`),
  and `AudioContext` (a fake with `createMediaStreamSource`, `createAnalyser`, `createGain`,
  `destination`, `state`, `resume`, `suspend`, `sampleRate: 48000`). Count `createMediaStreamSource`
  calls.
- Fake stream: `{ getTracks: () => [track], getAudioTracks: () => [track] }` with a `stop` spy.

Tests, names verbatim:
- `destroy twice is a no-op`
- `update after destroy throws`
- `destroy does not stop the caller's tracks`
- `update with equal options does not re-tap the stream`: `createMediaStreamSource` is called once.
- `omitted options reset to defaults`: after `update({ stream, state: "processing" })` then
  `update({ stream })`, the canvas `data-state` is `recording`.
- `destroy removes role, aria-label and data-state`

Because `audio-graph.ts` keeps a module-level context, call `vi.resetModules()` and re-import
`./visualiser` in `beforeEach`, so each test gets a fresh context.

## Verify

```sh
pnpm vitest run src/visualiser.test.ts && pnpm typecheck && pnpm lint && pnpm test && ! grep -rnE "eslint-disable|as any|: any\b" src playground && test ! -e playground/useAudioVisualiser.ts && test ! -e src/useAudioVisualiser.tsx
```

## Watch out

- `ctx.roundRect` exists in every current browser and in TS's DOM lib. Do not polyfill it.
- Read `getComputedStyle(canvas)` once per frame, not once per bar.
- `matchMedia`, `IntersectionObserver` and `ResizeObserver` must only be touched inside
  `createSurface`, never at module scope. AC10 (unit 07) imports `src/index.ts` in Node.
- Under React StrictMode the playground effect runs create, destroy, create on the same canvas.
  `destroy` must leave the canvas reusable: observers disconnected and attributes removed.
