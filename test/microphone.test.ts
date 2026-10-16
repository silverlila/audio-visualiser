import { describe, it, expect, vi } from "vitest";
import { createMicrophone, microphoneVisualState } from "../src/microphone";
import type { MicrophoneSnapshot } from "../src/microphone";

function fakeTrack(deviceId: string) {
  const endedListeners: (() => void)[] = [];
  return {
    kind: "audio",
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    addEventListener: (type: string, listener: () => void) => {
      if (type === "ended") endedListeners.push(listener);
    },
    end: () => {
      for (const listener of endedListeners) listener();
    },
  };
}

function fakeStream(deviceId: string) {
  const track = fakeTrack(deviceId);
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

type FakeStream = ReturnType<typeof fakeStream>;

function fakeDeviceInfo(kind: MediaDeviceKind, deviceId: string, label: string) {
  return { kind, deviceId, label, groupId: "" };
}

type FakeDeviceInfo = ReturnType<typeof fakeDeviceInfo>;

interface PendingRequest {
  readonly constraints: MediaStreamConstraints;
  resolve(stream: FakeStream): void;
  reject(cause: unknown): void;
}

function fakeMediaDevices() {
  const requests: PendingRequest[] = [];
  const deviceChangeListeners = new Set<() => void>();
  const fake = {
    getUserMedia: vi.fn(
      (constraints: MediaStreamConstraints) =>
        new Promise<FakeStream>((resolve, reject) => requests.push({ constraints, resolve, reject })),
    ),
    enumerateDevices: vi.fn(async () => [
      fakeDeviceInfo("audioinput", "mic-a", "Mic A"),
      fakeDeviceInfo("audioinput", "mic-b", "Mic B"),
      fakeDeviceInfo("audiooutput", "speaker", "Speaker"),
    ]),
    addEventListener: (type: string, listener: () => void) => {
      if (type === "devicechange") deviceChangeListeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === "devicechange") deviceChangeListeners.delete(listener);
    },
  };
  return {
    mediaDevices: fake as unknown as MediaDevices,
    getUserMedia: fake.getUserMedia,
    enumerateDevices: fake.enumerateDevices,
    requests,
    deviceChangeListenerCount: () => deviceChangeListeners.size,
    fireDeviceChange: () => {
      for (const listener of deviceChangeListeners) listener();
    },
  };
}

function lastRequest(requests: PendingRequest[]): PendingRequest {
  const request = requests.at(-1);
  if (request === undefined) throw new Error("getUserMedia was not called");
  return request;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function liveMicrophone() {
  const devices = fakeMediaDevices();
  const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
  const started = mic.start();
  const stream = fakeStream("mic-a");
  lastRequest(devices.requests).resolve(stream);
  await started;
  return { mic, devices, stream };
}

describe("createMicrophone", () => {
  it("start while requesting calls getUserMedia once", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });

    const first = mic.start();
    const second = mic.start();

    expect(second).toBe(first);
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(mic.getSnapshot().status).toBe("requesting");

    const stream = fakeStream("mic-a");
    lastRequest(devices.requests).resolve(stream);
    const settled = await first;
    expect(settled.status).toBe("live");
    expect(settled.stream).toBe(stream);
    expect(settled.deviceId).toBe("mic-a");
  });

  it("start while live resolves without a new request", async () => {
    const { mic, devices } = await liveMicrophone();

    const snapshot = await mic.start();

    expect(snapshot.status).toBe("live");
    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("a request resolved after stop has its tracks stopped", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });

    const started = mic.start();
    mic.stop();
    const stream = fakeStream("mic-a");
    lastRequest(devices.requests).resolve(stream);
    await started;

    expect(stream.track.stop).toHaveBeenCalled();
    expect(mic.getSnapshot().status).toBe("idle");
    expect(mic.getSnapshot().stream).toBeNull();
  });

  it("a superseded request has its tracks stopped", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });

    const first = mic.start({ deviceId: "mic-a" });
    const firstRequest = lastRequest(devices.requests);
    const second = mic.start({ deviceId: "mic-b" });
    const secondRequest = lastRequest(devices.requests);

    const staleStream = fakeStream("mic-a");
    firstRequest.resolve(staleStream);
    await first;
    expect(staleStream.track.stop).toHaveBeenCalled();
    expect(mic.getSnapshot().status).toBe("requesting");

    const currentStream = fakeStream("mic-b");
    secondRequest.resolve(currentStream);
    const settled = await second;
    expect(settled.stream).toBe(currentStream);
    expect(currentStream.track.stop).not.toHaveBeenCalled();
  });

  it("stop twice notifies once", async () => {
    const { mic, stream } = await liveMicrophone();
    const listener = vi.fn();
    mic.subscribe(listener);
    await flush();
    listener.mockClear();

    mic.stop();
    mic.stop();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.lastCall?.[0]).toMatchObject({ status: "idle", stream: null });
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
  });

  it("retry clears the previous error", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });

    const failed = mic.start();
    lastRequest(devices.requests).reject({ name: "NotReadableError" });
    expect((await failed).error?.kind).toBe("in-use");

    const retried = mic.start();
    expect(mic.getSnapshot()).toMatchObject({ status: "requesting", error: null });
    lastRequest(devices.requests).resolve(fakeStream("mic-a"));
    expect(await retried).toMatchObject({ status: "live", error: null });
  });

  it("NotAllowedError maps to permission-denied", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    const cause = new DOMException("Permission denied", "NotAllowedError");

    const started = mic.start();
    lastRequest(devices.requests).reject(cause);
    const snapshot = await started;

    expect(snapshot.status).toBe("error");
    expect(snapshot.error).toEqual({
      kind: "permission-denied",
      message: "Microphone permission was denied.",
      cause,
    });
  });

  it("an unrecognised failure maps to unknown", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });

    const started = mic.start();
    lastRequest(devices.requests).reject({ name: "toString" });

    expect((await started).error?.kind).toBe("unknown");
  });

  it("track ended moves to device-lost", async () => {
    const { mic, stream } = await liveMicrophone();

    stream.track.end();

    const snapshot = mic.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.error?.kind).toBe("device-lost");
    expect(snapshot.stream).toBeNull();
  });

  it("missing mediaDevices reports unsupported", async () => {
    const mic = createMicrophone();

    const snapshot = await mic.start();

    expect(snapshot.status).toBe("error");
    expect(snapshot.error?.kind).toBe("unsupported");
  });

  it("switching device stops the old stream", async () => {
    const { mic, devices, stream: oldStream } = await liveMicrophone();

    const switched = mic.start({ deviceId: "mic-b" });

    expect(oldStream.track.stop).toHaveBeenCalled();
    const request = lastRequest(devices.requests);
    expect(request.constraints.audio).toMatchObject({ deviceId: { exact: "mic-b" } });
    request.resolve(fakeStream("mic-b"));
    expect(await switched).toMatchObject({ status: "live", deviceId: "mic-b" });
  });

  it("requests the default audio processing merged with the caller's constraints", () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices, audio: { autoGainControl: false } });

    void mic.start();

    expect(lastRequest(devices.requests).constraints).toEqual({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
  });

  it("getSnapshot keeps its identity until something changes", async () => {
    const { mic } = await liveMicrophone();
    const before = mic.getSnapshot();

    expect(mic.getSnapshot()).toBe(before);
    expect(Object.isFrozen(before)).toBe(true);

    mic.stop();
    expect(mic.getSnapshot()).not.toBe(before);
  });

  it("subscribers see audio inputs, refreshed on devicechange", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    const seen: MicrophoneSnapshot[] = [];

    const unsubscribe = mic.subscribe((snapshot) => seen.push(snapshot));
    expect(seen).toHaveLength(1);
    await flush();

    expect(mic.getSnapshot().devices).toEqual([
      { id: "mic-a", label: "Mic A" },
      { id: "mic-b", label: "Mic B" },
    ]);
    expect(devices.deviceChangeListenerCount()).toBe(1);

    devices.fireDeviceChange();
    await flush();
    expect(seen).toHaveLength(2);

    unsubscribe();
    expect(devices.deviceChangeListenerCount()).toBe(0);
  });

  it("a start from a requesting listener calls getUserMedia once", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    let reentered = false;
    mic.subscribe((snapshot) => {
      if (snapshot.status !== "requesting" || reentered) return;
      reentered = true;
      void mic.start();
    });

    const started = mic.start();

    expect(devices.getUserMedia).toHaveBeenCalledTimes(1);
    const stream = fakeStream("mic-a");
    lastRequest(devices.requests).resolve(stream);
    expect((await started).stream).toBe(stream);
    mic.stop();
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it("a stop from a requesting listener stops the late stream", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    mic.subscribe((snapshot) => {
      if (snapshot.status === "requesting") mic.stop();
    });

    const started = mic.start();
    expect(mic.getSnapshot().status).toBe("idle");
    const stream = fakeStream("mic-a");
    for (const request of devices.requests) request.resolve(stream);

    expect((await started).status).toBe("idle");
    expect(stream.track.stop).toHaveBeenCalled();
  });

  it("a failing device list keeps the previous list and warns", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      mic.subscribe(() => undefined);
      await flush();
      const cause = new DOMException("Document is not fully active", "InvalidStateError");
      devices.enumerateDevices.mockRejectedValueOnce(cause);

      devices.fireDeviceChange();
      await flush();

      expect(warn).toHaveBeenCalledWith(expect.any(String), cause);
      expect(mic.getSnapshot().devices).toEqual([
        { id: "mic-a", label: "Mic A" },
        { id: "mic-b", label: "Mic B" },
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("a device list that arrives late does not overwrite a newer one", async () => {
    const devices = fakeMediaDevices();
    const mic = createMicrophone({ mediaDevices: devices.mediaDevices });
    let resolveStale: (list: FakeDeviceInfo[]) => void = () => undefined;
    devices.enumerateDevices.mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)));

    mic.subscribe(() => undefined);
    devices.fireDeviceChange();
    await flush();
    resolveStale([fakeDeviceInfo("audioinput", "unplugged", "Unplugged Mic")]);
    await flush();

    expect(mic.getSnapshot().devices).toEqual([
      { id: "mic-a", label: "Mic A" },
      { id: "mic-b", label: "Mic B" },
    ]);
  });

  it("microphoneVisualState maps every status", () => {
    expect(microphoneVisualState({ status: "idle" })).toBe("idle");
    expect(microphoneVisualState({ status: "requesting" })).toBe("connecting");
    expect(microphoneVisualState({ status: "live" })).toBe("recording");
    expect(microphoneVisualState({ status: "error" })).toBe("error");
  });
});
