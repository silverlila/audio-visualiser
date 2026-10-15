# 04 — `createMicrophone`: permission, device choice, stream lifecycle

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC7
- **You will see**: `pnpm test` proves the microphone can't leak a second stream (bug 3), that
  stopping twice is harmless, and that a retry clears the old error (bug 6).

## Goal

Add `src/microphone.ts`, the framework-agnostic store that owns getting a microphone
`MediaStream`. It is tested against a fake `MediaDevices`, which is the system boundary. Nothing
visual uses it until unit 05.

## Files

- `src/microphone.ts` (new)
- `src/microphone.test.ts` (new)
- `src/index.ts`: export `createMicrophone`, `microphoneVisualState` and the public types below.

## Changes

### 1. Public types: exact

```ts
import type { VisualState } from "./states";

export const MICROPHONE_ERROR_KINDS = ["unsupported", "permission-denied", "not-found", "in-use", "device-lost", "unknown"] as const;
export type MicrophoneErrorKind = (typeof MICROPHONE_ERROR_KINDS)[number];
export interface MicrophoneError { readonly kind: MicrophoneErrorKind; readonly message: string; readonly cause: unknown }
export interface MicrophoneDevice { readonly id: string; readonly label: string }   // label "" before permission is granted

type MicrophoneStatus =
  | { readonly status: "idle";       readonly stream: null;        readonly deviceId: null;   readonly error: null }
  | { readonly status: "requesting"; readonly stream: null;        readonly deviceId: null;   readonly error: null }
  | { readonly status: "live";       readonly stream: MediaStream; readonly deviceId: string; readonly error: null }
  | { readonly status: "error";      readonly stream: null;        readonly deviceId: null;   readonly error: MicrophoneError };
export type MicrophoneSnapshot = MicrophoneStatus & { readonly devices: readonly MicrophoneDevice[] };

export interface MicrophoneOptions {
  /** Merged over the defaults { echoCancellation: true, noiseSuppression: true, autoGainControl: true }. Read once at creation. */
  readonly audio?: Omit<MediaTrackConstraints, "deviceId">;
  /** Test seam. Default: navigator.mediaDevices, read lazily on first use (never at import or creation). */
  readonly mediaDevices?: MediaDevices;
}

export interface Microphone {
  /** Same object identity until something changes (safe for useSyncExternalStore). */
  getSnapshot(): MicrophoneSnapshot;
  /** Calls listener immediately with the current snapshot, then on every change. Returns unsubscribe. */
  subscribe(listener: (snapshot: MicrophoneSnapshot) => void): () => void;
  /** Never rejects; resolves with the settled snapshot. */
  start(options?: { readonly deviceId?: string }): Promise<MicrophoneSnapshot>;
  /** Idempotent. Aborts an in-flight request. The microphone stays restartable. */
  stop(): void;
}

export function createMicrophone(options?: MicrophoneOptions): Microphone;
/** idle -> "idle", requesting -> "connecting", live -> "recording", error -> "error". */
export function microphoneVisualState(snapshot: Pick<MicrophoneSnapshot, "status">): VisualState;
```

Methods are closures, not `this`-based, so `const { start } = mic` and `onClick={mic.start}` work.

### 2. Behaviour

- **Generation counter.** `stop()` and every new request increment `generation`. When
  `getUserMedia` settles, compare the captured generation with the current one. If they differ,
  stop every track of the stream that arrived and return the current snapshot. This guarantees the
  mic indicator turns off for superseded requests (bug 3).
- `start(opts)`:
  - With no `mediaDevices` (`navigator.mediaDevices` is undefined, e.g. an insecure context or
    Node), go to `error` with kind `unsupported` and resolve.
  - `requesting` with the same requested `deviceId` (both undefined counts as the same): return the
    **same in-flight promise**, so `getUserMedia` is called once.
  - `live`, with no `deviceId` given or the same `deviceId` as the live one: resolve the current
    snapshot without a new request.
  - Otherwise, stop the old tracks if live, increment the generation, emit `requesting` (this
    clears any previous `error`), and call
    `getUserMedia({ audio: { ...defaults, ...options.audio, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } })`.
  - On success: emit `live` with `deviceId = track.getSettings().deviceId ?? "default"`. Add an
    `ended` listener to the audio track that moves to `error` kind `device-lost` if this generation
    is still current. Refresh `devices`, because labels appear after permission.
  - On failure: emit `error` with `toMicrophoneError(cause)`.
- `stop()`: increment the generation, stop all tracks of the live stream, and emit `idle`. If the
  status is already `idle`, emit nothing. That makes `stop twice notifies once` true.
- **Error mapping** by `cause.name` (works for `DOMException` and for plain objects in tests):
  - `NotAllowedError` and `SecurityError` map to `permission-denied`.
  - `NotFoundError` and `OverconstrainedError` map to `not-found`.
  - `NotReadableError` and `AbortError` map to `in-use`.
  - Anything else maps to `unknown`.
  - `message` is a human sentence per kind, e.g. "Microphone permission was denied."
- **Devices.** The first `subscribe` calls `enumerateDevices()` (filtered to `kind === "audioinput"`
  and mapped to `{ id: deviceId, label }`) and adds a `devicechange` listener. The last
  unsubscribe removes it. A device-list change emits a new snapshot.
- **Snapshots.** Build a new frozen snapshot object only when a field changes. `getSnapshot()`
  returns the cached one.

### 3. Tests: names verbatim (AC7)

Use a hand-written fake implementing the parts of `MediaDevices` used:
- `getUserMedia` returns a promise you resolve manually.
- `enumerateDevices` returns two fake inputs.
- `addEventListener` and `removeEventListener` are present.

Fake streams are objects with `getTracks()` and `getAudioTracks()`. Their tracks have `stop()`
spies, `getSettings()`, and `addEventListener`. Build them with a typed factory function instead of
casts. If a cast is unavoidable, use a single `as unknown as MediaDevices` in one helper.

- `start while requesting calls getUserMedia once`
- `a request resolved after stop has its tracks stopped`
- `a superseded request has its tracks stopped`
- `stop twice notifies once`
- `retry clears the previous error`
- `NotAllowedError maps to permission-denied`
- `track ended moves to device-lost`
- `missing mediaDevices reports unsupported`
- `switching device stops the old stream`
- `microphoneVisualState maps every status`

## Verify

```sh
pnpm test && pnpm typecheck && pnpm lint
```

## Watch out

- Node 25 has a global `navigator` object. That's why the default `mediaDevices` must be read as
  `globalThis.navigator?.mediaDevices` at call time. In Node it is `undefined`, which gives
  `unsupported`, so the test seam must be the `mediaDevices` option, not a global stub.
