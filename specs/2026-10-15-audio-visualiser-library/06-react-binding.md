# 06 — React binding: `<AudioVisualiser>` and `useMicrophone`

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC9
- **You will see**: the playground looks the same as after unit 05, but `playground/App.tsx` is now
  `<AudioVisualiser stream={mic.stream} … />` plus `useMicrophone()`, with no hand-written effects.
- **Skills**: `component-design`

## Goal

Add the `audio-visualiser/react` entry. It holds one component and one hook, each a thin wrapper
over the core, with no logic of its own. The playground switches to them.

## Files

- `src/react/AudioVisualiser.tsx` (new)
- `src/react/useMicrophone.ts` (new)
- `src/react/index.ts` (new)
- `src/react/index.test.ts` (new)
- `playground/App.tsx`: switch to the binding.

## Changes

### 1. `src/react/useMicrophone.ts`

```ts
import type { Microphone, MicrophoneOptions, MicrophoneSnapshot } from "../index";
export type UseMicrophoneResult = MicrophoneSnapshot & Pick<Microphone, "start" | "stop">;
/** Owns one Microphone for the component's lifetime. `options` is read once, at mount. Stops on unmount. */
export function useMicrophone(options?: MicrophoneOptions): UseMicrophoneResult;
```

- `const [mic] = useState(() => createMicrophone(options))`.
- `const snapshot = useSyncExternalStore(mic.subscribe, mic.getSnapshot, mic.getSnapshot)`. The
  core's `subscribe` passes the snapshot to its listener. React ignores the argument, which is fine.
- `useEffect(() => () => mic.stop(), [mic])`. Under StrictMode this stops a microphone that was
  never started (a no-op), and the microphone stays restartable.
- Return `useMemo(() => ({ ...snapshot, start: mic.start, stop: mic.stop }), [snapshot, mic])`, so
  the identity changes only when the snapshot changes.

### 2. `src/react/AudioVisualiser.tsx`

```tsx
import type { ComponentPropsWithRef, ReactElement } from "react";
import type { VisualiserOptions } from "../index";
export type AudioVisualiserProps =
  Omit<ComponentPropsWithRef<"canvas">, "children" | "width" | "height" | "role">
  & Pick<VisualiserOptions, "stream" | "state" | "variant">;
export function AudioVisualiser(props: AudioVisualiserProps): ReactElement;
```

- Destructure `stream`, `state`, `variant`, `"aria-label": label`, `ref` and `style`. Pass `...rest`
  to `<canvas>`.
- Keep the latest options in a ref: `optionsRef.current = { stream, state, variant, label }`.
- Create the visualiser in a **React 19 callback ref with cleanup**, made stable with
  `useCallback(..., [])`:
  ```ts
  (canvas: HTMLCanvasElement) => {
    const vis = createVisualiser(canvas, optionsRef.current);
    visRef.current = vis;
    return () => { vis.destroy(); visRef.current = null; };
  }
  ```
  Merge it with the user's `ref`, which may be a function or an object. A callback ref follows a
  canvas remount, which a `useRef` and `useEffect` pair would not.
- `useLayoutEffect(() => { visRef.current?.update({ stream, state, variant, label }); }, [stream, state, variant, label])`.
- Default style `{ display: "block", width: "100%", height: "100%" }`, with the caller's `style`
  spread over it.
- The component never calls `setState`. It re-renders only when its props change, never per
  animation frame.

### 3. `src/react/index.ts`

```ts
export * from "../index";
export { AudioVisualiser } from "./AudioVisualiser";
export type { AudioVisualiserProps } from "./AudioVisualiser";
export { useMicrophone } from "./useMicrophone";
export type { UseMicrophoneResult } from "./useMicrophone";
```

Inside `src/react/`, import the core only through `"../index"`. That keeps unit 09's bundle split
clean: `react.js` imports `index.js` and never inlines core modules.

### 4. `src/react/index.test.ts` (AC9)

- `react entry exports the component, the hook and the core`: dynamic `import("./index")`. Assert
  that `AudioVisualiser` and `useMicrophone` are functions and that `createVisualiser` and
  `VARIANTS` are present. This runs in Node, so it also proves nothing touches the DOM at import.

### 5. `playground/App.tsx`

```tsx
import { AudioVisualiser, useMicrophone, microphoneVisualState } from "audio-visualiser/react";
const mic = useMicrophone();
<AudioVisualiser stream={mic.stream} state={microphoneVisualState(mic)} variant="timeline"
  aria-label="Microphone level" style={{ height: 64, color: "CanvasText" }} />
```

Remove the hand-written effects from unit 05. The speech-to-text wiring is unchanged.

## Verify

```sh
pnpm typecheck && pnpm lint && pnpm test
```

## Watch out

- `eslint-plugin-react-refresh` (`only-export-components`) checks `.tsx` files.
  `AudioVisualiser.tsx` must export only the component, so its props type is fine, but no helper
  functions.
- `react-hooks` v7 lint rules flag writing `optionsRef.current` during render. Write it inside a
  `useLayoutEffect` that runs before the update effect, or pass the initial options through the
  callback ref's closure with a documented exception. Pick whichever keeps lint clean without an
  `eslint-disable`.
