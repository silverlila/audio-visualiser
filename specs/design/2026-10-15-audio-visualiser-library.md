# audio-visualiser as a library: framework-agnostic core + React binding + playground

> Design settled on 2026-10-15 by /architect. The shape below is the input to /to-spec.

## Problem

The repo is a Vite React app (React 19.2, TS 5.9 strict with `verbatimModuleSyntax` and
`erasableSyntaxOnly`, pnpm) holding two hooks. `src/useAudioVisualiser.tsx` fuses four kinds of
knowledge in one hook — microphone acquisition, Web Audio graph lifecycle, signal measurement and
canvas drawing — and each of its bugs sits where one leaked into another:

1. Level is one FFT bin (`getByteFrequencyData()[20]`, ≈3.75 kHz), not loudness.
2. One history sample per animation frame, so scroll speed doubles on a 120 Hz display.
3. `start()` while running opens a second stream and AudioContext; the first mic track is orphaned.
4. `stop()` twice calls `AudioContext.close()` on a closed context → unhandled rejection.
5. Canvas ignores `devicePixelRatio`, never resizes, bars reach half height, colour is hard-coded
   `#000`, the last frame stays after stop.
6. A new array is allocated every frame; `any` casts on typed arrays; `error` never clears on retry.
7. `src/useSpeechToText.tsx` captures `transcript` and the callback props once at mount, so the
   transcript never accumulates.

The goal is a publishable package whose core future Solid, Vue and Svelte adapters wrap in a few
lines each, so every per-frame policy must live in the core and the core's lifecycle must map
one-to-one onto framework lifecycles (mount → create, props change → update, unmount → destroy).

Constraints traced from the code: the only consumers are `src/App.tsx` (rewritten as the
playground) and `src/main.tsx`; the package is `private`, `0.0.0`, with no external users, so the
migration cost is zero beyond the files themselves. `tsconfig.app.json` carries ambient types
(`vite/client`, `dom-speech-recognition`) that must not leak into shipped declarations.
`erasableSyntaxOnly` forbids enums, so vocabularies are `as const` tuples.

## Already decided

- **Core + `./react` subpath in one package, no monorepo.** Solid/Vue/Svelte adapters come later as
  further subpaths; the core is what they wrap.
- **The visualiser takes a `MediaStream` and never calls `getUserMedia`.** The app owns the stream
  (it is also recording it); the visualiser must be able to share it and must never stop its tracks.
- **Mic acquisition is a separate core module** with a React hook, handling permission, device
  choice and lifecycle.
- **Canvas 2D rendering, one stateless draw function per variant file.**
- **Variants:** `timeline`, `pill`, `spectrum`, `line`, `orb`, `radial`.
- **States:** `idle`, `connecting`, `recording`, `processing`, `done`, `error`, set by the caller,
  animated between rather than snapped. Mirrors Superwhisper's state dot (loading / processing /
  done).
- **Signal pipeline:** RMS of time-domain float data → dBFS → 0..1 with a noise floor;
  fast-attack/slow-release envelopes; log-spaced bands 80 Hz–8 kHz; fixed-rate history sampling
  independent of refresh rate; ring buffer.
- **Canvas hygiene:** DPR-aware backing store, ResizeObserver, pause when the tab is hidden or the
  canvas is offscreen, honour `prefers-reduced-motion`, colour from CSS `color`, `role="img"` +
  `aria-label`.
- **No React re-renders during animation.**
- **Build:** ESM only, `.d.ts`, `exports` for `"."` and `"./react"`, React as an optional peer,
  `sideEffects: false`, Vitest for pure functions.
- **Speech-to-text leaves the package** and lives in the playground (fixed), so people can try it
  next to the visualiser.
- **The bugs above are fixed by the new core, not patched in the old hooks**, which are deleted.

## Out of scope

- `playback` variant (static recorded waveform with progress) — later.
- Building the Solid/Vue/Svelte adapters — only the seam is designed.
- Publishing to npm; `private: true` stays.
- WebGL, OffscreenCanvas, AudioWorklet, monorepo/workspaces.
- Public custom-variant API (`Variant`/`Frame` exported) — internal until a second author exists.
- Public tuning knobs (dB floor, attack/release, sample period) — constants, tuned in the playground.
- Speech-to-text, recording or transcription inside the package.

## Done looks like

- `pnpm dev` opens the playground. You pick a source (microphone with a device picker, a test tone
  whose loudness wobbles like speech, or an audio file), a variant, a state, a size and a colour.
  Speaking makes the visual follow your voice's loudness; vowels move it, not only "s" sounds.
  Switching state cross-fades (processing shows a sweep, idle breathes). A gallery shows all six
  variants on the same source at once. Dark mode works with no code change. The speech-to-text
  panel transcribes and the text accumulates across sentences.
- Clicking Start twice leaves one mic indicator; Stop twice logs nothing to the console.
- The timeline scrolls at the same speed on 60 Hz and 120 Hz displays and is crisp on Retina.
- `pnpm build` writes `dist/index.js`, `dist/react.js` and their `.d.ts`; `pnpm test` passes;
  `pnpm lint` and `pnpm typecheck` are clean.

## Usage (caller's view)

```tsx
// React
import { AudioVisualiser, useMicrophone, microphoneVisualState } from "audio-visualiser/react";

function DictationButton({ transcribe }: { transcribe: (s: MediaStream) => Promise<void> }) {
  const mic = useMicrophone();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (mic.status !== "live") return void mic.start();
        setBusy(true);
        await transcribe(mic.stream);
        mic.stop();
        setBusy(false);
      }}
    >
      <AudioVisualiser
        variant="pill"
        stream={mic.stream}
        state={busy ? "processing" : microphoneVisualState(mic)}
        className="h-6 w-16"
        aria-label="Dictation"
      />
      {mic.error && <span role="alert">{mic.error.message}</span>}
    </button>
  );
}
```

```ts
// Vanilla, and the exact shape every adapter wraps
import { createMicrophone, createVisualiser, microphoneVisualState } from "audio-visualiser";

const mic = createMicrophone();
const vis = createVisualiser(canvas, { variant: "spectrum" });
mic.subscribe((snap) =>
  vis.update({ variant: "spectrum", stream: snap.stream, state: microphoneVisualState(snap) }),
);
recordButton.onclick = () => mic.start(); // idempotent, never rejects
stopButton.onclick = () => mic.stop();    // idempotent
// teardown: vis.destroy(); mic.stop();
```

```svelte
<!-- future Svelte adapter: createVisualiser already is an action -->
<canvas use:createVisualiser={{ variant: "timeline", stream: $mic.stream, state }} class="h-8 w-full" />
```

## Shape

```ts
// src/states.ts — the state vocabulary and its per-state policy
export const VISUAL_STATES = ["idle", "connecting", "recording", "processing", "done", "error"] as const;
export type VisualState = (typeof VISUAL_STATES)[number];
/** Each weight in 0..1, sum = 1. Approaching a one-hot target keeps the sum, so an interrupted
 *  transition never snaps. */
export type StateWeights = Readonly<Record<VisualState, number>>;
export function createStateWeights(initial: VisualState): Record<VisualState, number>;
export function stepStateWeights(w: Record<VisualState, number>, target: VisualState, dtMs: number, tauMs: number): void;
export function defaultLabel(state: VisualState): string;

// src/signal.ts — what the numbers mean: the dB scales, loudness, bands, envelopes, the clock. Pure.
export interface DbRange { readonly floorDb: number; readonly ceilingDb: number }
export const LOUDNESS_RANGE: DbRange;   // RMS dBFS, start at -60..-10
export const SPECTRUM_RANGE: DbRange;   // getFloatFrequencyData dB, start at -100..-30
export function rms(samples: ArrayLike<number>): number;
export function amplitudeToDb(amplitude: number): number;              // 0 -> -Infinity
export function normalizeDb(db: number, range: DbRange): number;       // clamped 0..1, -Infinity -> 0
export function stepEnvelope(current: number, target: number, dtMs: number, attackMs: number, releaseMs: number): number;
/** band i covers bins [startBin[i], endBin[i]), endBin > startBin; low bands may share a bin. */
export interface BandLayout { readonly count: number; readonly startBin: Uint16Array; readonly endBin: Uint16Array }
export function logBandLayout(count: number, minHz: number, maxHz: number, sampleRate: number, fftSize: number): BandLayout;
export function measureBands(spectrumDb: ArrayLike<number>, layout: BandLayout, out: Float32Array): void; // no allocation
export interface FixedClock { carryMs: number }
/** Whole periods elapsed; mutates clock. dt > maxGapMs drops the backlog (tab was hidden). */
export function stepFixedClock(clock: FixedClock, dtMs: number, periodMs: number, maxGapMs: number): number;

// src/history.ts — the time axis
export interface HistoryView {
  readonly length: number;
  at(age: number): number;   // 0 = newest; ages >= length return 0
  readonly phase: number;    // 0..1 of the current period elapsed: sub-sample scroll offset
}
export interface History extends HistoryView { push(value: number): void; setPhase(p: number): void; clear(): void }
export function createHistory(capacity: number): History; // Float32Array ring

// src/display.ts — ALL time-based smoothing of what is on screen; refresh-rate independence lives here
export interface Display {
  readonly level: number; readonly bands: Float32Array; readonly history: HistoryView;
  readonly weights: StateWeights; readonly ambientMs: number;   // frozen under reduced motion
}
export interface DisplayInput {
  readonly target: VisualState;
  readonly loudness: number;                 // 0..1 un-smoothed; 0 when no stream
  readonly bandTargets: ArrayLike<number> | null;
  readonly reducedMotion: boolean;
}
export function createDisplay(bandCount: number, initial: VisualState): Display & { step(input: DisplayInput, dtMs: number): void; setBandCount(n: number): void };

// src/audio-graph.ts — the one AudioContext and per-stream analyser taps
export const FFT_SIZE = 2048;
export interface AnalyserTap {
  readonly sampleRate: number;
  read(waveform: Float32Array<ArrayBuffer>, spectrumDb: Float32Array<ArrayBuffer>): void;
  release(): void;   // idempotent; never closes the context
}
/** Lazily created shared AudioContext, never closed (bug 4 impossible): suspended when the last tap
 *  releases, resumed on tap, plus a one-shot pointerdown/keydown resume if it stays suspended. */
export function tapStream(stream: MediaStream): AnalyserTap;

// src/surface.ts — facts about the host canvas; the single writer of its attributes
export interface Surface {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number; readonly height: number;          // CSS px
  readonly active: boolean;                                 // tab visible && intersecting && area > 0
  readonly reducedMotion: boolean;
  readColors(): { readonly ink: string; readonly accent: string };  // `color`, `--av-accent` (falls back to ink)
  beginFrame(): void;                                       // sync backing store to css*dpr, setTransform, clearRect
  setAccessibility(state: VisualState, label: string): void; // role="img", aria-label, data-state
  dispose(): void;                                          // idempotent; clears canvas, removes written attrs
}
export function createSurface(canvas: HTMLCanvasElement, onActiveChange: () => void): Surface;

// src/variants/frame.ts — internal renderer contract
export interface Frame {
  readonly width: number; readonly height: number; readonly ink: string; readonly accent: string;
  readonly level: number; readonly bands: ArrayLike<number>; readonly waveform: ArrayLike<number>;
  readonly history: HistoryView; readonly state: VisualState; readonly weights: StateWeights;
  readonly ambientMs: number;
}
export interface Variant { readonly bands: number; draw(ctx: CanvasRenderingContext2D, frame: Frame): void }
// src/variants/index.ts
export const VARIANTS = ["timeline", "pill", "spectrum", "line", "orb", "radial"] as const;
export type VariantName = (typeof VARIANTS)[number];
export const RENDERERS: Record<VariantName, Variant>;

// src/visualiser.ts — composition shell; owns the loop
export interface VisualiserOptions {
  readonly stream?: MediaStream | null;   // caller owns it; never stopped here
  readonly state?: VisualState;           // default: "recording" if stream else "idle"; explicit wins
  readonly variant?: VariantName;         // default "timeline"
  readonly label?: string;                // aria-label; default defaultLabel(state)
}
export interface Visualiser {
  /** Replaces all options (omitted -> default). Equal values are no-ops. Throws after destroy(). */
  update(options?: VisualiserOptions): void;
  /** Idempotent: releases the tap, observers and rAF; clears the canvas. */
  destroy(): void;
}
export function createVisualiser(canvas: HTMLCanvasElement, options?: VisualiserOptions): Visualiser;

// src/microphone.ts — stream ownership
export type MicrophoneErrorKind =
  "unsupported" | "permission-denied" | "not-found" | "in-use" | "device-lost" | "unknown";
export interface MicrophoneError { readonly kind: MicrophoneErrorKind; readonly message: string; readonly cause: unknown }
export interface MicrophoneDevice { readonly id: string; readonly label: string }  // label "" before permission
type MicrophoneStatus =
  | { readonly status: "idle";       readonly stream: null;        readonly deviceId: null;   readonly error: null }
  | { readonly status: "requesting"; readonly stream: null;        readonly deviceId: null;   readonly error: null }
  | { readonly status: "live";       readonly stream: MediaStream; readonly deviceId: string; readonly error: null }
  | { readonly status: "error";      readonly stream: null;        readonly deviceId: null;   readonly error: MicrophoneError };
export type MicrophoneSnapshot = MicrophoneStatus & { readonly devices: readonly MicrophoneDevice[] };
export interface MicrophoneOptions {
  readonly audio?: Omit<MediaTrackConstraints, "deviceId">; // default EC/NS/AGC on
  readonly mediaDevices?: MediaDevices;                     // default navigator.mediaDevices, read lazily (test seam)
}
export interface Microphone {
  getSnapshot(): MicrophoneSnapshot;                                 // stable identity until change
  subscribe(listener: (s: MicrophoneSnapshot) => void): () => void;  // calls listener immediately
  start(options?: { readonly deviceId?: string }): Promise<MicrophoneSnapshot>; // never rejects
  stop(): void;                                                      // idempotent, aborts in-flight request
}
export function createMicrophone(options?: MicrophoneOptions): Microphone;
export function microphoneVisualState(s: Pick<MicrophoneSnapshot, "status">): VisualState;

// src/react/AudioVisualiser.tsx
export type AudioVisualiserProps =
  Omit<ComponentPropsWithRef<"canvas">, "children" | "width" | "height" | "role">
  & Pick<VisualiserOptions, "stream" | "state" | "variant">;
export function AudioVisualiser(props: AudioVisualiserProps): ReactElement;
// src/react/useMicrophone.ts
export type UseMicrophoneResult = MicrophoneSnapshot & Pick<Microphone, "start" | "stop">;
export function useMicrophone(options?: MicrophoneOptions): UseMicrophoneResult;
```

Load-bearing decisions:

- **One frame loop per visualiser**, rAF-driven, running only while `surface.active`. Per frame:
  `tap.read` → `rms` → `amplitudeToDb` → `normalizeDb(LOUDNESS_RANGE)` → `display.step(dt)`
  (envelopes, `stepFixedClock` → `history.push`, state weights, ambient clock) →
  `surface.beginFrame()` → `RENDERERS[variant].draw(ctx, frame)`. The `Frame` object and every
  typed array are allocated once and mutated in place.
- **Refresh-rate independence is owned by `display.ts` alone.** Renderers receive no `dt` and no
  raw clock, only `ambientMs` (frozen under reduced motion), so a variant cannot reintroduce bug 2
  or ignore reduced motion.
- **The visualiser never owns a stream; the microphone never touches a canvas.** They meet only at
  `MediaStream`. Bug 3 dies in `microphone.ts` (generation counter: a superseded or stopped request
  stops its tracks on arrival); bug 4 dies in `audio-graph.ts` (context never closed).
- **Errors are state, not exceptions.** `start()` resolves with the snapshot; a retry moves status
  to `requesting`, which clears the error by construction (bug 6).
- **`update()` replaces, not merges**, so every adapter forwards its props object verbatim and a
  removed prop resets. Internally the visualiser diffs, so equal values are no-ops.
- **The core is the only writer of the canvas's `width`, `height`, `role`, `aria-label` and
  `data-state`.** The React component strips those props and routes `aria-label` to `label`.
  `data-state` lets CSS theme per state (`[data-state=error] { color: … }`).

Interface depth: the public core is `createVisualiser` (2 methods), `createMicrophone` (4 methods),
`microphoneVisualState`, the `VARIANTS` and `VISUAL_STATES` tuples, and types. The React subpath
adds one component and one hook and re-exports the core. Hidden behind that: the audio graph and
autoplay handling, typed buffers without casts, loudness calibration, band layout, envelopes, the
fixed-rate sampler, the ring buffer, DPR/resize/visibility/reduced-motion handling, colour
resolution, state cross-fades, a11y attributes, getUserMedia races, DOMException classification and
device enumeration. Every option maps one-to-one to a framework prop, so the surface cannot shrink
without losing a capability the playground uses.

## Module map

- `src/index.ts` — core entry; re-exports only.
- `src/states.ts` — state vocabulary, weight blending, default labels.
- `src/signal.ts` — dB scales, RMS, normalisation, envelope, band layout and measurement, fixed clock. Pure.
- `src/history.ts` — ring buffer of sampled levels and the scroll phase.
- `src/display.ts` — every time-based smoothing step; the refresh-rate-independence invariant.
- `src/audio-graph.ts` — the shared AudioContext and per-stream analyser taps.
- `src/surface.ts` — canvas facts (DPR, size, visibility, reduced motion, colours) and the canvas's attributes.
- `src/visualiser.ts` — loop and composition; diffs options; no math of its own.
- `src/microphone.ts` — mic state machine, device list, error parsing.
- `src/variants/frame.ts` — `Frame`/`Variant` contract. `src/variants/draw.ts` — shared primitives (rounded bar, shimmer).
- `src/variants/{timeline,pill,spectrum,line,orb,radial}.ts` — one renderer each. `src/variants/index.ts` — `VARIANTS`, `RENDERERS`.
- `src/react/index.ts`, `src/react/AudioVisualiser.tsx`, `src/react/useMicrophone.ts` — the binding.
- `src/*.test.ts` — Vitest for signal, history, display, states, microphone (fake `mediaDevices`).
- `playground/` — `index.html`, `main.tsx`, `App.tsx`, `sources.ts` (tone + file sources), `useSpeechToText.ts` (moved, fixed), styles. Imports only `audio-visualiser` and `audio-visualiser/react`, aliased to `src/` in Vite.
- Build config: `vite.config.ts` (playground dev, root `playground/`, aliases), `vite.lib.config.ts` (lib mode, entries `index` + `react`, ES, `react` and `react/jsx-runtime` external), `tsconfig.lib.json` (declarations only, no ambient app types), `tsconfig.playground.json`.

## Synthesis decision

The three stances converged on the core: `create…(canvas, options) → { update, destroy }` as the
adapter seam (it is a Svelte action as-is), a microphone exposed as a `getSnapshot`/`subscribe`
store whose `start()` never rejects, generation-counted request races, pure tested signal math, a
ring buffer with a scroll phase, stateless renderers fed a reused frame object, and state blending
by weights. That convergence is the main result.

**Base: `ideal-caller`.** It had the smallest public surface that still served every call site, and
its replace-semantics `update()` and flat microphone snapshot (`mic.stream` readable without
narrowing) make adapters pure pass-throughs.

Grafted from `own-the-invariant`:
- `display.ts` as the single owner of time-based smoothing, keeping `visualiser.ts` a thin shell
  and making refresh-rate independence testable in Node.
- Renderers get `ambientMs` instead of a raw clock, so reduced motion cannot be forgotten.
- `data-state` on the canvas for CSS theming per state.
- An injectable `mediaDevices` on `createMicrophone` as the test seam at the system boundary.
- Playground aliases the package specifiers to `src/`, so it can only use the public surface.
- Live colour reads each frame so CSS colour transitions animate.

Grafted from `extend-whats-there`:
- Variant names as strings plus an internal `Variant` contract, rather than exporting renderer
  values. Exporting `Frame`/`Variant` would freeze the renderer contract before a second author exists.
- The tradeoff analysis on Safari autoplay and AGC, now open questions.

Rejected:
- **A `useAudioVisualiser(canvasRef, options)` hook as the React surface** (`extend-whats-there`): it
  cannot follow a canvas remount and makes callers render and size the canvas themselves. A
  component with a React 19 callback ref handles both.
- **Patch-merge `update()`** (`extend-whats-there`, `own-the-invariant`): a prop removed in an adapter
  would silently keep its old value.
- **Variants as imported values for tree-shaking** (`own-the-invariant`): six small renderers cost a
  few KB, and string names keep `variant="pill"` usable from Vue/Svelte templates and the playground.
- **One AudioContext per visualiser** (`extend-whats-there`): multiplies the autoplay problem and
  makes double-close a per-instance concern. **A per-stream refcounted WeakMap of contexts**
  (`own-the-invariant`): solves the same thing with more machinery than one shared, never-closed
  context.
- **Loop sleep when "settled", with a 4 Hz colour poll** (`own-the-invariant`): `idle` breathes and
  `processing` sweeps, so the loop is rarely settled while visible. Pausing while hidden or offscreen
  captures most of the saving.
- **Branded `Decibels`/`Level` numbers**: renderers only do arithmetic, and brands on typed-array
  storage force casts.

## Tradeoffs accepted

- We accept all six renderers in every bundle in exchange for string variant names usable from any template.
- We accept a process-lifetime AudioContext that is suspended but never closed in exchange for double-close being impossible and one autoplay-resume path.
- We accept that vanilla callers re-pass every option on `update()` in exchange for adapters that forward props verbatim.
- We accept `mic.start()` never rejecting in exchange for no unhandled rejections from `onClick={() => mic.start()}`; failures are rendered state.
- We accept the core writing attributes on the caller's canvas in exchange for one writer per attribute.
- We accept no public tuning options in exchange for a four-field options type; constants are tuned in the playground.
- We accept stateless renderers (no per-variant spring physics) in exchange for refresh-rate independence owned in one module.
- We accept that the timeline freezes while hidden or offscreen and resumes without catch-up in exchange for zero work while invisible.
- We accept a React `^19` peer in exchange for callback-ref cleanup and ref-as-prop with no `forwardRef`.
- We accept one `getComputedStyle` read per frame in exchange for theme changes and CSS colour transitions applying with no observers.
- We accept rendering being verified only in the playground in exchange for not adding a canvas mock; Vitest covers everything that is pure.

## Alternatives considered

- **Keep a React-first hook that owns mic and canvas, with a core extracted later**: lost because the
  core would inherit the fused lifecycle that caused bugs 3 and 4, and every future adapter would
  re-implement it.
- **A single `AudioVisualiser` that accepts a `microphone` object instead of a stream**: lost because
  it couples the halves and breaks the decision that the app owns the stream.
- **Exported renderer values with a public `Variant`/`Frame` contract**: lost on interface depth;
  it makes internal frame fields public API with no second consumer, for a few KB of tree-shaking.

## Open questions

- **Spelling.** The package and code say "visualiser"; your messages say "visualizer". The design
  uses British spelling throughout to match the package name. Renaming is mechanical.
- **Safari autoplay.** The shared context is created after `await getUserMedia`; Safari may keep it
  suspended until a gesture. The one-shot gesture resume covers it on paper; it needs a real Safari check.
- **AGC default.** `autoGainControl: true` (kept from the old code) flattens loudness differences.
  It stays the default and the playground exposes a toggle to judge it.
- **Calibration constants** (-60/-10 dBFS, attack 25 ms, release 250 ms, sample period 45 ms) are
  starting values to tune in the playground.
- **Two mic captures in the playground.** Web Speech opens the mic separately from `useMicrophone`.
  Chrome shares the device; other browsers are untested.

## First implementation step

Set up Vitest and write `src/signal.ts` with tests: RMS → dBFS → 0..1, envelopes, log band layout and
the fixed clock. That is where bugs 1, 2 and 6 stop existing.
