# 08 — The playground

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC11
- **You will see**: `pnpm dev` opens a playground with these controls:
  - a source picker: microphone with a device list, a speech-like test tone, or an audio file
  - variant, state, size and colour controls, plus an AGC toggle
  - a gallery of all six variants
  - a "Simulate dictation" button that plays connecting → recording → processing → done
  - a speech-to-text panel that accumulates text
  - light, dark and system themes
- **Skills**: `design-foundations`, `forms-and-inputs`, `touch-and-accessibility`
- **Checkpoint**: `pnpm dev` → `http://localhost:5173/`. With no microphone, can you see every
  variant and state using the test tone? Does the dictation simulation look like a Superwhisper
  recording window? Is the page usable at 375 px wide?

## Goal

Turn `playground/App.tsx` into a real playground that only uses the public API
(`audio-visualiser/react`). It is dev-only and never shipped.

## Files

- `playground/sources.ts` (new): fake audio sources.
- `playground/sources.test.ts` (new)
- `playground/App.tsx`: rewritten as the layout and state owner.
- `playground/Controls.tsx` (new): the controls panel.
- `playground/Gallery.tsx` (new): all six variants on one source.
- `playground/SpeechPanel.tsx` (new): speech-to-text UI using `useSpeechToText`.
- `playground/index.css`: tokens and layout, including light/dark and per-state accent colours.

## Changes

### 1. `playground/sources.ts`

```ts
export interface FakeSource { readonly stream: MediaStream; stop(): void }   // stop is idempotent
/** Speech-like test signal: sawtooth ~140 Hz -> lowpass 1800 Hz -> gain driven by a 4 Hz "syllable"
 *  LFO times a slow 0.3 Hz phrase LFO -> MediaStreamAudioDestinationNode. Owns its own AudioContext. */
export function createToneSource(createContext?: () => AudioContext): FakeSource;
/** Loops the file through an <audio> element -> MediaElementSource -> speakers + MediaStreamDestination. */
export function createFileSource(file: File, createContext?: () => AudioContext): FakeSource;
```

- `stop()` stops oscillators, pauses and releases the media element, revokes the object URL, and
  closes **its own** context once. A `stopped` flag makes a second call return immediately.
- The `createContext` parameter is the test seam. It defaults to `() => new AudioContext()`.

`playground/sources.test.ts` (AC11): use a hand-rolled fake `AudioContext` with just the node
factories used, and spy on `close`.
- `tone source exposes a stream and stop is idempotent`: `close` is called exactly once after two
  `stop()` calls.

### 2. Layout and state (`App.tsx`)

- **State owned:** `source` (`"mic" | "tone" | "file"`), `deviceId`, `agc` (boolean, default
  `true`), `variant` (`VariantName`, default `"timeline"`), `stateOverride` (`VisualState | "auto"`,
  default `"auto"`), `height` (24–200 px, default 64), `ink` (colour), `theme`
  (`"system" | "light" | "dark"`).
- **Microphone.** `useMicrophone({ audio: { autoGainControl: agc } })` lives in a child component
  with `key={String(agc)}`. Options are read once, so toggling AGC remounts it and gives a fresh
  microphone. The device `<select>` lists `mic.devices`, and changing it calls
  `mic.start({ deviceId })`.
- **Tone and file.** Create the source in an effect keyed on the selection and call `stop()` in
  cleanup. The file input accepts `audio/*`.
- **Resolved state.**
  - When `stateOverride` is `"auto"`: `microphoneVisualState(mic)` for the mic source, and
    `"recording"` for tone and file while a stream exists.
  - Otherwise use the override.
  - While a simulation runs, the simulated state wins.
- **Main preview.** One large `<AudioVisualiser>` with the chosen variant, at `height` px, full
  width, inside a card. A second, compact preview shows `variant="pill"` at 24×72 px inside a
  rounded dark "recording window" bar, the way Superwhisper's mini view looks.
- **Gallery.** All six variants in a responsive grid (min 160 px columns), each labelled, all on
  the same stream and state.
- **Simulate dictation.** A button that sets the simulated state through
  `connecting` (600 ms) → `recording` (4 s, needs a live source and starts the tone if none is
  running) → `processing` (1.5 s) → `done` (1.2 s) → back to auto. Cancel the timers on unmount and
  when clicked again.
- **Theme.** Set `data-theme` on `<html>`. In `index.css`:
  - define tokens on `:root`, override them under
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and under
    `:root[data-theme="dark"]`
  - give `body` an explicit background
  - the visualisers inherit `color` from their card
- **Per-state accent, Superwhisper-like.** Theme `--av-accent` by state through the canvas's
  `data-state`: `connecting` amber, `recording` red, `processing` blue, `done` green, `error` red.
  For example, `canvas[data-state="processing"] { --av-accent: oklch(0.65 0.17 250) }`.
- **Speech panel.**
  - Shows `isSupported`, Start, Stop and Clear, the accumulated `transcript`, and the
    `interimTranscript` in a muted style.
  - Shows a one-line note that Chrome sends speech audio to Google's servers.
  - Starting dictation also starts the mic source, so you see both together.
- **Errors.** Show `mic.error.message` in a `role="alert"` element next to the source picker.

### 3. Accessibility and responsiveness

- Every control has a `<label>`. Inputs use 16 px text so iOS doesn't zoom.
- Buttons have visible `:focus-visible` rings and a minimum 40 px hit target.
- The layout is a single column under 720 px with a 16 px gutter, and nothing scrolls horizontally.

## Verify

```sh
pnpm typecheck && pnpm lint && pnpm test
```

## Watch out

- `useSpeechToText` opens its own microphone capture through the Web Speech API. That's an
  existing open question, so don't try to share the stream.
- Browsers block `AudioContext` without a gesture. Create the tone source only from a click or a
  select change, never on initial render.
