# audio-visualiser: framework-agnostic core, React binding, playground

> Master file for this effort. Every unit file assumes what is here and does not repeat it —
> **read this first**.
> Generated from a working session on 2026-10-15.
> Audience: an engineer or agent with zero prior context on this effort.
> Design: `specs/design/2026-10-15-audio-visualiser-library.md` — the full argument behind the
> decisions below, for anyone who wants to reopen one.

## Goal

Turn this repo from an unfinished demo app into a library for drawing live audio as small,
state-aware visuals, the kind a dictation app (Superwhisper is the inspiration) shows while it
listens. The library has a core that works in any framework (`audio-visualiser`) and a React
binding (`audio-visualiser/react`). Solid, Vue and Svelte bindings will be added later as thin
wrappers. It ships six looks (timeline, pill, spectrum, line, orb, radial) and six states (idle,
connecting, recording, processing, done, error) that blend into each other. A playground app lets
anyone try every look with a microphone, a test tone or an audio file, and also try browser
speech-to-text. The old code had seven bugs (listed below). Each one becomes impossible in the new
structure rather than patched.

## Background & Context

**Repo today** (commit `16aafd4`, verify with `git log --oneline`): a Vite 7 + React 19.2 +
TypeScript 5.9 app, managed with pnpm 10. Files that matter:

- `src/useAudioVisualiser.tsx`: one hook that calls `getUserMedia`, builds an `AudioContext` and
  `AnalyserNode` (`fftSize = 256`), and on every animation frame pushes `getByteFrequencyData()[20]`
  into a `number[]` and draws black bars on a canvas passed in by ref. It starts with
  `/* eslint-disable @typescript-eslint/no-explicit-any */`.
- `src/useSpeechToText.tsx`: wraps the Web Speech API (`SpeechRecognition` /
  `webkitSpeechRecognition`). `pnpm lint` reports one warning on it, at line 78 (missing deps
  `props`, `transcript`).
- `src/App.tsx`: renders an 800×50 canvas and Start/Stop buttons wired to both hooks. It has a stray
  `console.log("re-rendering")`.
- `src/main.tsx`, `src/index.css`, and `index.html` at the root. `src/App.css` and
  `src/assets/react.svg` are unused Vite-template leftovers, and so is `public/vite.svg`.
- `tsconfig.json` references `tsconfig.app.json` (includes `src`, ambient types `vite/client` and
  `dom-speech-recognition`) and `tsconfig.node.json` (includes `vite.config.ts`). Both set
  `verbatimModuleSyntax`, `erasableSyntaxOnly` (so **no `enum`, `namespace`, or constructor parameter
  properties**), `allowImportingTsExtensions`, `noEmit`, `strict`, `noUnusedLocals`, and
  `noUnusedParameters`.
- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`eslint .`), `preview`.
  There is no test runner.

**The seven bugs** (numbered here; unit files refer to them by number):

1. The level comes from one FFT bin (index 20 of 128, about 3.75 kHz at 48 kHz), not loudness. Vowels barely move it.
2. History gets one sample per animation frame, so scroll speed doubles on a 120 Hz display.
3. Calling `start()` while already running opens a second stream and AudioContext, and the first mic track keeps recording.
4. Calling `stop()` twice runs `AudioContext.close()` on a closed context, which causes an unhandled promise rejection.
5. The canvas ignores `devicePixelRatio` (blurry), never resizes, bars only reach half the height, colour is hard-coded `#000`, and the last frame stays after stop.
6. A new array is allocated every frame, typed arrays use `any` casts, and `error` never clears on retry.
7. `useSpeechToText` captures `transcript` and its callback props once at mount, so the transcript never accumulates.

**Target module map** (the units create these):

- `src/signal.ts`: what the numbers mean. Holds the dB ranges, RMS, normalisation, envelope, log band layout and measurement, and the fixed-rate clock. Pure functions.
- `src/history.ts`: a ring buffer of sampled levels plus the scroll phase.
- `src/states.ts`: the state vocabulary, state-weight blending, default aria labels, and `stateMix`.
- `src/display.ts`: every time-based smoothing step. This is the one place that guarantees refresh-rate independence.
- `src/microphone.ts`: the microphone state machine, device list, and error parsing.
- `src/audio-graph.ts`: the shared AudioContext and the analyser taps, one per stream.
- `src/surface.ts`: facts about the canvas (DPR, size, visibility, reduced motion, colours) and the attributes written onto it.
- `src/variants/frame.ts`: the internal `Frame` and `Variant` renderer contract.
- `src/variants/draw.ts`: shared drawing primitives.
- `src/variants/<name>.ts`: one renderer per variant.
- `src/variants/index.ts`: `VARIANTS` and `RENDERERS`.
- `src/visualiser.ts`: the per-canvas frame loop. It wires the pieces together and contains no maths.
- `src/index.ts`: the core public entry.
- `src/react/index.ts`, `src/react/AudioVisualiser.tsx`, `src/react/useMicrophone.ts`: the React binding.
- `playground/`: the dev-only app. It imports only `audio-visualiser` and `audio-visualiser/react`, which are aliased to `src/`.

**How data flows each animation frame** (one loop per visualiser):

1. `tap.read(waveform, spectrumDb)`
2. `rms(waveform)` → `amplitudeToDb` → `normalizeDb(LOUDNESS_RANGE)` gives the loudness 0..1
3. `measureBands(spectrumDb, layout, bandTargets)`, only when the variant uses bands
4. `display.step(input, dtMs)`, which applies the envelopes, ticks the fixed clock and pushes to history, blends state weights, and advances the ambient clock
5. `surface.beginFrame()`
6. `RENDERERS[variant].draw(ctx, frame)`

The `Frame` object and every typed array are allocated once and mutated in place.

**Conventions for all units:**

- Relative imports inside `src/` are **extensionless** (`import { rms } from "./signal"`). Emitted
  `.d.ts` files keep import specifiers as written, so a `.ts` extension would break them for
  consumers.
- Vocabularies are `as const` tuples with derived union types. Never use `enum`.
- No `any`, no `as` casts on typed arrays, no `eslint-disable`. `new Float32Array(n)` is already
  `Float32Array<ArrayBuffer>`, which is what `AnalyserNode.getFloat*Data` expects in TS 5.9.
- Tests use explicit imports: `import { describe, it, expect } from "vitest"`.
- No module may touch `window`, `document` or `navigator` at import time. They are read lazily
  inside functions, so importing the package in Node (tests, SSR) has no side effects.

## Requirements

1. The core takes a `MediaStream` and never calls `getUserMedia` or stops a stream's tracks.
2. `createVisualiser(canvas, options) → { update, destroy }`. `update` replaces all options: anything left out goes back to its default, and equal values do nothing. `destroy` can be called more than once, and `update` after `destroy` throws.
3. `createMicrophone(options) → { getSnapshot, subscribe, start, stop }`. `start` never rejects, and a second `start` while a request is in flight returns that same in-flight promise. A request that finishes after `stop()`, or after a newer request has replaced it, stops its own tracks when it arrives. Calling `stop` twice does nothing the second time. A retry clears the previous error.
4. Loudness is the RMS of the time-domain float data, converted to dBFS and then to 0..1 with a noise floor (fixes bug 1).
5. History is sampled every 45 ms of real time, whatever the refresh rate. Renderers get a 0..1 scroll phase so the motion stays smooth (fixes bug 2).
6. Smoothing uses time constants: a fast attack, a slow release, and state blending. It depends on elapsed milliseconds, not on how often it is called.
7. Bands are log-spaced from 80 Hz to 8 kHz, and every band covers at least one FFT bin.
8. The canvas backing store follows CSS size × `devicePixelRatio`. Drawing stops while the tab is hidden or the canvas is offscreen. Ambient motion freezes and state changes snap under `prefers-reduced-motion`. Ink comes from CSS `color`, and accent from `--av-accent`, falling back to the ink colour. The canvas gets `role="img"`, `aria-label`, and `data-state` (fixes bug 5).
9. There are six variants and six states. Every variant shows every state, and states cross-fade.
10. React gets `<AudioVisualiser>` and `useMicrophone()`. Neither triggers a React render per animation frame.
11. Speech-to-text lives only in the playground, and its transcript accumulates (fixes bug 7).
12. `pnpm build` emits ESM `dist/index.js`, `dist/react.js` and declarations, with React external.

## Decisions Made

| Decision | Rationale | Rejected alternatives & why |
|---|---|---|
| Core + `./react` subpath in one package, no monorepo | Future Solid/Vue/Svelte bindings become more subpaths of the same package. One package is simpler to build and version. | A pnpm-workspace monorepo: it adds tooling with only one binding to justify it. |
| The visualiser takes a `MediaStream` and the app owns it | A dictation app also records the stream (e.g. with MediaRecorder), so the visualiser must share it and never stop it. | The visualiser calling `getUserMedia` itself: that caused bugs 3 and 4 and opens the mic twice. `<AudioVisualiser microphone={mic}>`: it couples the two halves. |
| `createVisualiser(canvas, options) → { update, destroy }` is the core adapter seam | It maps one-to-one onto mount, prop-change and unmount in every framework, and it is a Svelte action as-is. | Separate setters (`setStream`, `setState`, …): each adapter would need N wiring points instead of one. |
| `update()` replaces all options and diffs internally | Adapters forward their props object verbatim, and a prop removed in a template resets to its default. | Patch-merge, where undefined means keep: a prop removed in an adapter would silently keep its old value. |
| Microphone as a store (`getSnapshot`/`subscribe`) with a flat snapshot | `useSyncExternalStore`, Svelte stores and Solid `from()` consume this shape directly. `mic.stream` is readable without narrowing. | An event emitter: it doesn't fit those primitives. A nested `state` union: callers would have to narrow before reading `stream`. |
| `start()` never rejects; errors are snapshot state | `onClick={() => mic.start()}` can never cause an unhandled rejection, and the UI has to render the error kind. | Rejecting promises: every call site needs a `catch`, and forgetting one is silent. |
| One shared, lazily created AudioContext that is suspended when unused and never closed | Bug 4 becomes impossible, and there is a single place for autoplay-resume handling. | One context per visualiser: it multiplies the autoplay problem. A per-stream refcounted `WeakMap` of contexts: more machinery for the same result. |
| All time-based smoothing lives in `display.ts`; renderers get no `dt` and no raw clock, only `ambientMs` | Refresh-rate independence and reduced motion are guaranteed in one tested module, so a variant cannot break them. | Per-variant animation state or spring physics: six places to get bug 2 wrong. |
| State blending uses a weight vector that approaches a one-hot target | An interrupted transition never snaps, and the weights always sum to 1. | `from/to/progress`: it cannot represent an interrupted transition. |
| Variants are named by string; the `Variant`/`Frame` contract is internal | `variant="pill"` works in any template. Making the contract public would freeze it before a second author exists. | Exported renderer values for tree-shaking: saves a few KB but makes the call sites worse. |
| React surface is a component, not a `canvasRef` hook | A React 19 callback ref with cleanup follows canvas remounts, and callers don't have to render and size a canvas themselves. | `useAudioVisualiser(canvasRef, options)`: it can't follow a remount. |
| The core is the only writer of the canvas's `width`, `height`, `role`, `aria-label`, `data-state` | One writer per attribute. `data-state` lets CSS theme each state. | Letting React set them: two writers that fight. |
| No public tuning options; constants are tuned in the playground | The options type stays at four fields. | Exposing floor dB, attack/release and sample period: nobody has asked for them. |
| React peer `^19` | Callback-ref cleanup and ref-as-prop; no `forwardRef`. | `>=18`: untested, and it would need the legacy ref paths. |
| Speech-to-text moves to the playground | Transcription is not a visualiser's job. Chrome's Web Speech also sends audio to Google, the opposite of Superwhisper's local-first approach. | Keeping it in the package. |
| The old hooks are deleted, not patched | The new core makes each bug structurally impossible. Patching code that gets deleted wastes work. | Fixing the bugs in place first. |
| British spelling (`visualiser`) everywhere | Matches the package name and existing code. | Mixed spellings. |

**Tradeoffs accepted:**

- All six renderers ship in every bundle.
- The AudioContext lives for the whole process.
- Vanilla callers must pass every option again on each `update()`.
- The core writes attributes onto the caller's canvas.
- Renderers are stateless.
- The timeline freezes while hidden and resumes without catching up.
- `getComputedStyle` is read once per frame so CSS colour transitions animate.
- Rendering is only verified by eye in the playground, because Node has no canvas.

## Current State

Nothing is started. The baseline is commit `16aafd4` on `main`.

## Out of Scope

- `playback` variant (static recorded waveform with progress): later.
- Building Solid, Vue or Svelte bindings: only the seam is designed.
- Publishing to npm. `"private": true` stays in `package.json`.
- WebGL, OffscreenCanvas, AudioWorklet, monorepo or workspaces.
- A public custom-variant API (exporting `Variant` or `Frame`).
- Public tuning options (dB floor, attack/release, sample period).
- Speech-to-text, recording, or transcription inside the package.
- Supporting consumers that use `moduleResolution: node16`/`nodenext` (which need `.js` specifiers in declarations). See Open Questions.

## Acceptance Criteria

- AC1: `pnpm typecheck` exits 0. Every project compiles: library, playground, configs.
- AC2: `pnpm lint` exits 0 with `--max-warnings 0` in the script. No lint warnings anywhere.
- AC3: `pnpm test` exits 0. The whole Vitest suite passes.
- AC4: `pnpm vitest run src/signal.test.ts src/history.test.ts` exits 0 and includes the tests `rms of a full-scale sine is 1/sqrt(2)`, `normalizeDb clamps to 0..1`, `stepEnvelope result depends on elapsed time, not call count`, `logBandLayout gives every band at least one bin`, `stepFixedClock ticks the same at 60 Hz and 120 Hz`, `history at(age) returns newest first and wraps`.
- AC5: `pnpm vitest run playground/speech.test.ts` exits 0 and includes `appendFinal accumulates text across results` (bug 7).
- AC6: `pnpm vitest run src/states.test.ts src/display.test.ts` exits 0 and includes `state weights sum to 1 throughout a transition`, `reduced motion snaps weights and freezes ambient`, `history fills at the same rate at 60 Hz and 120 Hz`.
- AC7: `pnpm vitest run src/microphone.test.ts` exits 0 and includes `start while requesting calls getUserMedia once`, `a request resolved after stop has its tracks stopped`, `stop twice notifies once`, `retry clears the previous error`, `NotAllowedError maps to permission-denied`, `track ended moves to device-lost`.
- AC8: `! grep -rnE "eslint-disable|as any|: any\b" src playground && test ! -e playground/useAudioVisualiser.ts && test ! -e src/useAudioVisualiser.tsx` exits 0. The old hook is gone and nothing works around the type system.
- AC9: `pnpm vitest run src/react/index.test.ts` exits 0. The React entry exports `AudioVisualiser`, `useMicrophone` and re-exports the core.
- AC10: `pnpm vitest run src/index.test.ts` exits 0. The core entry imports in Node with no DOM, and exports `createVisualiser`, `createMicrophone`, `microphoneVisualState`, `VISUAL_STATES`, and `VARIANTS` equal to `["timeline","pill","spectrum","line","orb","radial"]`.
- AC11: `pnpm vitest run playground/sources.test.ts` exits 0. Playground source helpers expose `{ stream, stop }` and `stop` can be called twice (tested with a fake AudioContext).
- AC12: `pnpm build && test -f dist/index.js && test -f dist/react.js && test -f dist/index.d.ts && test -f dist/react/index.d.ts && ! grep -q getUserMedia dist/react.js && grep -qE 'from ?"react' dist/react.js` exits 0. Both entries and their declarations are built, the React entry imports the core instead of inlining it, and React stays external.

- AC13 — `pnpm vitest run src/visualiser.test.ts` exits 0 and includes `destroy twice is a no-op`, `update after destroy throws`, `destroy does not stop the caller's tracks`, `update with equal options does not re-tap the stream`, `omitted options reset to defaults`, `destroy removes role, aria-label and data-state` (jsdom with faked canvas context, observers and AudioContext).

## Units

| # | File | What it changes |
|---|---|---|
| 01 | `01-signal-and-history.md` | Vitest, plus the pure signal maths and the history ring buffer, with tests |
| 02 | `02-playground-restructure.md` | Move the app to `playground/`, split tsconfigs, add aliases, fix and test speech-to-text |
| 03 | `03-states-and-display.md` | State vocabulary and blending, plus `display.ts` (all time-based smoothing), with tests |
| 04 | `04-microphone.md` | `createMicrophone` state machine with tests against fake `mediaDevices` |
| 05 | `05-visualiser-core-timeline.md` | Audio graph, surface, frame loop, `timeline` variant; playground switches to it; old hook deleted |
| 06 | `06-react-binding.md` | `<AudioVisualiser>` and `useMicrophone`; playground switches to them |
| 07 | `07-variants.md` | `pill`, `spectrum`, `line`, `orb`, `radial` renderers |
| 08 | `08-playground.md` | Full playground: sources, controls, gallery, dictation-flow demo, speech panel, theming |
| 09 | `09-library-build.md` | Library build, `exports`, declarations, README |

Run them in order. Each leaves the repo green on its own.

## Verification

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm vitest run src/visualiser.test.ts
pnpm build && test -f dist/index.js && test -f dist/react.js && test -f dist/index.d.ts && test -f dist/react/index.d.ts && ! grep -q getUserMedia dist/react.js && grep -qE 'from ?"react' dist/react.js
! grep -rnE "eslint-disable|as any|: any\b" src playground && test ! -e playground/useAudioVisualiser.ts && test ! -e src/useAudioVisualiser.tsx
```

## Open Questions

- **Safari autoplay.** The shared AudioContext is created after `await getUserMedia`, so Safari may
  leave it `suspended`. `audio-graph.ts` calls `resume()` and adds a one-shot
  `pointerdown`/`keydown` resume. This has not been checked on a real Safari.
- **AGC default.** `autoGainControl: true` (kept from the old code) flattens loudness differences.
  It stays the default, and the playground has a toggle so you can judge it.
- **Calibration constants** (-60/-10 dBFS loudness range, -100/-30 dB spectrum range, attack 25 ms,
  release 250 ms, sample period 45 ms, state tau 150 ms) are starting values to tune in the
  playground.
- **Two mic captures in the playground.** Web Speech opens the mic separately from
  `useMicrophone`. Chrome shares the device; other browsers are untested.
- **`node16`/`nodenext` consumers.** The declarations use extensionless specifiers, which work for
  `bundler` resolution (Vite, Next, etc.). Supporting `node16` would need `.js` specifiers or a
  declaration bundler. Decide before publishing.

## Landed
01. ✔ 8 files. `pnpm test` ran 20 tests in 2 files, all passing (RMS of a full-scale sine = 1/√2, envelope depends on elapsed ms not call count, fixed clock ticks the same at 60 and 120 Hz); `pnpm typecheck` clean. Carried should-fix: `history.at()` returns undefined for fractional ages; `stepFixedClock`/`stepEnvelope` propagate a NaN dt.
02. ✔ 18 files. App moved to `playground/` (Vite root, `audio-visualiser` alias resolves to `src/index.ts`), tsconfig split into lib/playground; `pnpm typecheck && pnpm lint && pnpm test` exit 0 — lint now zero warnings, 24 tests incl. `appendFinal accumulates text across results`. Carried should-fix: `discard()` uses `stop()` so a pending final result can refill the cleared transcript (`abort()` would not).
03. ✔ 6 files. `pnpm test` 36 tests in 5 files pass — state weights stay summed to 1 through an interrupted transition, history fills at the same rate at 60 and 120 Hz, reduced motion snaps weights and freezes ambient, a NaN dt changes nothing; typecheck and lint clean. Field guide started at `.claude/field-guide.md`.
04. ✔ 4 files. `pnpm test` 55 tests pass incl. 19 microphone tests — start while requesting calls getUserMedia once, a request resolved after stop (or stopped from inside the requesting notification) has its tracks stopped, retry clears the error, a failing device list warns instead of an unhandled rejection; typecheck and lint clean. One fix round (re-entrant listener race) re-reviewed clean.
