import type { VisualState } from "./states";

export const MICROPHONE_ERROR_KINDS = ["unsupported", "permission-denied", "not-found", "in-use", "device-lost", "unknown"] as const;
export type MicrophoneErrorKind = (typeof MICROPHONE_ERROR_KINDS)[number];

export interface MicrophoneError {
  readonly kind: MicrophoneErrorKind;
  readonly message: string;
  readonly cause: unknown;
}

/** `label` is "" until microphone permission has been granted. */
export interface MicrophoneDevice {
  readonly id: string;
  readonly label: string;
}

type MicrophoneStatus =
  | { readonly status: "idle"; readonly stream: null; readonly deviceId: null; readonly error: null }
  | { readonly status: "requesting"; readonly stream: null; readonly deviceId: null; readonly error: null }
  | { readonly status: "live"; readonly stream: MediaStream; readonly deviceId: string; readonly error: null }
  | { readonly status: "error"; readonly stream: null; readonly deviceId: null; readonly error: MicrophoneError };

export type MicrophoneSnapshot = MicrophoneStatus & { readonly devices: readonly MicrophoneDevice[] };

export interface MicrophoneOptions {
  /** Merged over the defaults { echoCancellation: true, noiseSuppression: true, autoGainControl: true }. Read once at creation. */
  readonly audio?: Omit<MediaTrackConstraints, "deviceId">;
  /** For tests. Defaults to navigator.mediaDevices, read on first use, never at import or creation. */
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

const DEFAULT_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const satisfies MediaTrackConstraints;

const IDLE = { status: "idle", stream: null, deviceId: null, error: null } as const satisfies MicrophoneStatus;
const REQUESTING = { status: "requesting", stream: null, deviceId: null, error: null } as const satisfies MicrophoneStatus;

const ERROR_KIND_BY_NAME: ReadonlyMap<string, MicrophoneErrorKind> = new Map([
  ["NotAllowedError", "permission-denied"],
  ["SecurityError", "permission-denied"],
  ["NotFoundError", "not-found"],
  ["OverconstrainedError", "not-found"],
  ["NotReadableError", "in-use"],
  ["AbortError", "in-use"],
]);

const ERROR_MESSAGES: Readonly<Record<MicrophoneErrorKind, string>> = {
  unsupported: "This browser cannot access a microphone here. A secure (https) page is required.",
  "permission-denied": "Microphone permission was denied.",
  "not-found": "No matching microphone was found.",
  "in-use": "The microphone is in use by another application or could not be opened.",
  "device-lost": "The microphone was disconnected.",
  unknown: "The microphone could not be started.",
};

const VISUAL_STATE_BY_STATUS = {
  idle: "idle",
  requesting: "connecting",
  live: "recording",
  error: "error",
} as const satisfies Record<MicrophoneStatus["status"], VisualState>;

/** idle -> "idle", requesting -> "connecting", live -> "recording", error -> "error". */
export function microphoneVisualState(snapshot: Pick<MicrophoneSnapshot, "status">): VisualState {
  return VISUAL_STATE_BY_STATUS[snapshot.status];
}

function microphoneError(kind: MicrophoneErrorKind, cause: unknown): MicrophoneError {
  return { kind, message: ERROR_MESSAGES[kind], cause };
}

function errorName(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null || !("name" in cause)) return null;
  return typeof cause.name === "string" ? cause.name : null;
}

function toMicrophoneError(cause: unknown): MicrophoneError {
  const name = errorName(cause);
  const kind = (name !== null ? ERROR_KIND_BY_NAME.get(name) : undefined) ?? "unknown";
  return microphoneError(kind, cause);
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function sameDevices(a: readonly MicrophoneDevice[], b: readonly MicrophoneDevice[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((device, i) => device.id === b[i].id && device.label === b[i].label);
}

async function listAudioInputs(mediaDevices: MediaDevices): Promise<MicrophoneDevice[]> {
  const all = await mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput").map((d) => ({ id: d.deviceId, label: d.label }));
}

interface InFlight {
  readonly deviceId: string | undefined;
  readonly promise: Promise<MicrophoneSnapshot>;
}

export function createMicrophone(options: MicrophoneOptions = {}): Microphone {
  const audio: MediaTrackConstraints = { ...DEFAULT_AUDIO, ...options.audio };
  const listeners = new Set<(snapshot: MicrophoneSnapshot) => void>();

  let snapshot: MicrophoneSnapshot = Object.freeze({ ...IDLE, devices: [] });
  let generation = 0;
  let inFlight: InFlight | null = null;
  let watched: MediaDevices | null = null;
  let latestRefresh = 0;

  function resolveMediaDevices(): MediaDevices | undefined {
    return options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  }

  function commit(next: MicrophoneSnapshot): void {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener(snapshot);
  }

  function setStatus(next: MicrophoneStatus): void {
    const unchanged =
      next.status === snapshot.status &&
      next.stream === snapshot.stream &&
      next.deviceId === snapshot.deviceId &&
      next.error === snapshot.error;
    if (unchanged) return;
    commit({ ...next, devices: snapshot.devices });
  }

  function setDevices(devices: readonly MicrophoneDevice[]): void {
    if (sameDevices(devices, snapshot.devices)) return;
    commit({ ...snapshot, devices });
  }

  function refreshDevices(mediaDevices: MediaDevices): void {
    const refresh = ++latestRefresh;
    listAudioInputs(mediaDevices).then(
      (devices) => {
        if (refresh === latestRefresh) setDevices(devices);
      },
      (cause: unknown) => {
        console.warn("audio-visualiser: could not list microphones; keeping the previous list.", cause);
      },
    );
  }

  function onDeviceChange(): void {
    if (watched !== null) refreshDevices(watched);
  }

  function release(): void {
    generation++;
    inFlight = null;
    if (snapshot.stream !== null) stopTracks(snapshot.stream);
  }

  async function request(
    mediaDevices: MediaDevices,
    deviceId: string | undefined,
    requestGeneration: number,
  ): Promise<MicrophoneSnapshot> {
    const constraints = { audio: { ...audio, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } };

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia(constraints);
    } catch (cause) {
      if (requestGeneration !== generation) return snapshot;
      setStatus({ status: "error", stream: null, deviceId: null, error: toMicrophoneError(cause) });
      return snapshot;
    }

    if (requestGeneration !== generation) {
      stopTracks(stream);
      return snapshot;
    }

    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      stopTracks(stream);
      setStatus({ status: "error", stream: null, deviceId: null, error: microphoneError("unknown", stream) });
      return snapshot;
    }
    const track = tracks[0];
    track.addEventListener("ended", () => {
      if (requestGeneration !== generation) return;
      release();
      setStatus({ status: "error", stream: null, deviceId: null, error: microphoneError("device-lost", track) });
    });

    setStatus({ status: "live", stream, deviceId: track.getSettings().deviceId ?? "default", error: null });
    refreshDevices(mediaDevices);
    return snapshot;
  }

  function start(startOptions: { readonly deviceId?: string } = {}): Promise<MicrophoneSnapshot> {
    const { deviceId } = startOptions;

    const mediaDevices = resolveMediaDevices();
    if (mediaDevices === undefined) {
      setStatus({ status: "error", stream: null, deviceId: null, error: microphoneError("unsupported", null) });
      return Promise.resolve(snapshot);
    }
    if (snapshot.status === "requesting" && inFlight !== null && inFlight.deviceId === deviceId) {
      return inFlight.promise;
    }
    if (snapshot.status === "live" && (deviceId === undefined || deviceId === snapshot.deviceId)) {
      return Promise.resolve(snapshot);
    }

    release();
    const promise = request(mediaDevices, deviceId, generation);
    inFlight = { deviceId, promise };
    setStatus(REQUESTING);
    return promise;
  }

  function stop(): void {
    if (snapshot.status === "idle") return;
    release();
    setStatus(IDLE);
  }

  function getSnapshot(): MicrophoneSnapshot {
    return snapshot;
  }

  function subscribe(listener: (snapshot: MicrophoneSnapshot) => void): () => void {
    listeners.add(listener);
    listener(snapshot);

    if (watched === null) {
      const mediaDevices = resolveMediaDevices();
      if (mediaDevices !== undefined) {
        watched = mediaDevices;
        mediaDevices.addEventListener("devicechange", onDeviceChange);
        refreshDevices(mediaDevices);
      }
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && watched !== null) {
        watched.removeEventListener("devicechange", onDeviceChange);
        watched = null;
      }
    };
  }

  return { getSnapshot, subscribe, start, stop };
}
