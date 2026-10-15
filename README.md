# audio-visualiser

Draws live microphone audio as a small canvas visual that knows what your app is doing: idle,
connecting, recording, processing, done or error. It is built for the indicator a dictation app
shows while it listens, the way [Superwhisper](https://superwhisper.com) does. The core works in
any framework and takes a `MediaStream` you own. `audio-visualiser/react` wraps it in a component
and a hook.

## Install

The package is not on npm yet. Build and pack it, then add the tarball to your app:

```sh
pnpm install && pnpm build && pnpm pack
pnpm add ../path/to/audio-visualiser/audio-visualiser-0.1.0.tgz   # from your app
```

Install the tarball rather than linking the folder. A linked folder brings its own
`node_modules/react`, and two copies of React break the hooks.

It ships ESM only, with declarations. React (`^19`) is an optional peer dependency, needed only
for `audio-visualiser/react`.

## React

```tsx
import { useState } from "react";
import { AudioVisualiser, useMicrophone, microphoneVisualState } from "audio-visualiser/react";

function DictationButton({ transcribe }: { transcribe: (s: MediaStream) => Promise<void> }) {
  const mic = useMicrophone();
  const [busy, setBusy] = useState(false);
  return (
    <>
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
          style={{ width: 64, height: 24 }}
          aria-label="Dictation"
        />
      </button>
      {mic.error && <span role="alert">{mic.error.message}</span>}
    </>
  );
}
```

`<AudioVisualiser>` renders a `<canvas>` and accepts every canvas prop except `width`, `height`,
`role` and `children`. Its `aria-label` becomes the core's `label` option, and `ref` points at the
canvas. It re-renders only when its props change, never once per animation frame.

`useMicrophone(options?)` creates one microphone for the component's lifetime and stops it on
unmount. It returns the [snapshot](#microphone) fields plus `start` and `stop`. `options` is read
once, at mount.

`audio-visualiser/react` also re-exports everything from `audio-visualiser`.

## Vanilla

```ts
import { createMicrophone, createVisualiser, microphoneVisualState } from "audio-visualiser";

const mic = createMicrophone();
const vis = createVisualiser(canvas, { variant: "spectrum" });
const unsubscribe = mic.subscribe((snap) =>
  // update() replaces every option, so pass variant again
  vis.update({ variant: "spectrum", stream: snap.stream, state: microphoneVisualState(snap) }),
);
recordButton.onclick = () => mic.start(); // never rejects
stopButton.onclick = () => mic.stop();
// teardown: unsubscribe(); mic.stop(); vis.destroy();
```

`createVisualiser(canvas, options)` returns `{ update, destroy }`.

- `update(options)` replaces all options. Anything you leave out goes back to its default, and
  values equal to the current ones do nothing. After `destroy()` it throws.
- `destroy()` stops drawing, clears the canvas and removes `role`, `aria-label` and `data-state`.
  A second call does nothing. It never stops the stream's tracks.

## Options

| Option    | Type                  | Default                                           |
| --------- | --------------------- | ------------------------------------------------- |
| `stream`  | `MediaStream \| null` | `null`. Yours to stop; the visualiser never does. |
| `state`   | `VisualState`         | `"recording"` when `stream` is set, else `"idle"` |
| `variant` | `VariantName`         | `"timeline"`                                      |
| `label`   | `string`              | A label for the current state (below)             |

An unknown `state` or `variant` throws a `TypeError`. `createVisualiser` throws if the canvas has
no 2D context. `VARIANTS` and `VISUAL_STATES` export the valid names.

## Variants

- `timeline`: a scrolling history of loudness, newest bar at the right edge.
- `pill`: a compact mini view, an accent status dot followed by five rounded bars.
- `spectrum`: frequency bars mirrored around the centre, growing up and down from the midline.
- `line`: an oscilloscope trace of the waveform.
- `orb`: a filled circle that swells with loudness, its edge pushed out by the frequency bands, with
  a rotating accent arc while processing.
- `radial`: bars standing out from a ring, each lengthening with its frequency band.

## States and theming

| State        | Looks like                     | Default `aria-label`       |
| ------------ | ------------------------------ | -------------------------- |
| `idle`       | slow breathing pulse           | "Audio visualiser, idle"   |
| `connecting` | breathing with a faint shimmer | "Connecting microphone"    |
| `recording`  | driven by the live audio       | "Recording audio"          |
| `processing` | a sweeping shimmer             | "Processing audio"         |
| `done`       | settled and flat               | "Finished"                 |
| `error`      | settled and flat               | "Audio error"              |

Every variant draws every state, and a state change cross-fades smoothly: an exponential ease
with a 150 ms time constant, mostly settled after about half a second. With
`prefers-reduced-motion: reduce`, state changes snap and the ambient motion stops.

The core writes `role="img"`, `aria-label` and `data-state` onto the canvas, so you can style each
state in CSS:

```css
.dictation { color: #1c1c1e; --av-accent: #0a84ff; }
.dictation[data-state="error"] { color: #d70015; }
.dictation[data-state="done"] { color: #248a3d; transition: color 300ms; }
```

- `color` is the ink every variant draws with.
- `--av-accent` colours the `pill` status dot and the `orb` processing arc. Unset, it falls back to
  the ink.

The core reads the computed style every frame, so CSS transitions on `color` animate.

## Sizing

Size the canvas with CSS. The core sets its backing store to the CSS size times
`devicePixelRatio` and follows resizes, so the drawing stays sharp. It also sets `contain: size`
on the canvas while it runs, and restores the old value on `destroy()`.

`<AudioVisualiser>` renders the canvas with `display: block; width: 100%; height: 100%`, merged
under your `style`. Size it through `style` or a sized parent; a `className` width or height
loses to that inline style.

Drawing pauses while the tab is hidden, the canvas is offscreen, or either of its dimensions is 0.

## Microphone

`createMicrophone(options?)` returns `{ getSnapshot, subscribe, start, stop }`.

- `options.audio`: track constraints merged over `{ echoCancellation: true, noiseSuppression: true,
  autoGainControl: true }`. Read once.
- `subscribe(listener)` calls `listener` with the current snapshot straight away, then on every
  change, and returns an unsubscribe function. While anything is subscribed, it keeps `devices`
  current. The shape fits `useSyncExternalStore` and the Svelte store contract.
- `start({ deviceId? })` never rejects. It resolves with the settled snapshot, and any failure
  shows up in `snapshot.error`. A second call while a request for the same device is pending
  returns the same promise. Starting with a different `deviceId` switches microphones. A retry
  clears the previous error.
- `stop()` stops the tracks. A second call does nothing. If a request is still pending, its stream
  is stopped as soon as it arrives.

The snapshot is frozen and keeps the same identity until something changes:

| Field      | Type                              | Set when                                          |
| ---------- | --------------------------------- | ------------------------------------------------- |
| `status`   | `"idle" \| "requesting" \| "live" \| "error"` | always                                |
| `stream`   | `MediaStream \| null`             | a `MediaStream` only while `live`                 |
| `deviceId` | `string \| null`                  | a string only while `live`                        |
| `error`    | `MicrophoneError \| null`         | an error only while `error`                       |
| `devices`  | `readonly { id, label }[]`        | always; labels are `""` until permission is granted |

`MicrophoneError` is `{ kind, message, cause }`, where `cause` is the original exception or object.

| `kind`              | Cause                                                        |
| ------------------- | ------------------------------------------------------------ |
| `unsupported`       | no `navigator.mediaDevices`, e.g. a page served over http    |
| `permission-denied` | `NotAllowedError` or `SecurityError`                         |
| `not-found`         | `NotFoundError` or `OverconstrainedError`                    |
| `in-use`            | `NotReadableError` or `AbortError`                           |
| `device-lost`       | the live track ended, e.g. the microphone was unplugged      |
| `unknown`           | any other failure, or a stream with no audio track           |

`microphoneVisualState(snapshot)` maps `idle`, `requesting`, `live` and `error` to the visual
states `idle`, `connecting`, `recording` and `error`.

## Writing an adapter

A binding for another framework needs three calls:

1. On mount, `createVisualiser(canvas, props)`.
2. When props change, `update(props)`, passing the whole props object.
3. On unmount, `destroy()`.

That is already the shape of a Svelte action, so Svelte needs no wrapper:

```svelte
<canvas use:createVisualiser={{ variant: "timeline", stream: $mic.stream, state }} class="h-8 w-full" />
```

Don't set `width`, `height`, `role`, `aria-label` or `data-state` on the canvas yourself: the core
writes them, and `destroy()` removes the last three.

## Development

```sh
pnpm dev               # playground: every variant with a microphone, test tone or audio file
pnpm test              # Vitest
pnpm typecheck
pnpm lint
pnpm build             # library into dist/
pnpm build:playground  # playground into dist-playground/
```
