// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { createVisualiser as CreateVisualiser, VisualiserOptions } from "./visualiser";

function fakeAudioNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

/** The parts of AudioContext that the audio graph uses. */
function fakeAudioContextClass() {
  const createMediaStreamSource = vi.fn(() => fakeAudioNode());
  const suspend = vi.fn(() => Promise.resolve());
  class FakeAudioContext {
    state = "running";
    sampleRate = 48000;
    destination = fakeAudioNode();
    createMediaStreamSource = createMediaStreamSource;
    createAnalyser = () => ({
      ...fakeAudioNode(),
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: vi.fn(),
      getFloatFrequencyData: vi.fn(),
    });
    createGain = () => ({ ...fakeAudioNode(), gain: { value: 1 } });
    resume = vi.fn(() => Promise.resolve());
    suspend = suspend;
  }
  return { FakeAudioContext, createMediaStreamSource, suspend };
}

let observers: FakeObserver[];

class FakeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor() {
    observers.push(this);
  }
}

/** The CanvasRenderingContext2D methods the surface and renderers call, as no-ops. */
function fakeCanvasContext(): CanvasRenderingContext2D {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    roundRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function fakeStream() {
  const track = { kind: "audio", stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  return { track, stream: stream as unknown as MediaStream };
}

let createVisualiser: typeof CreateVisualiser;
let audio: ReturnType<typeof fakeAudioContextClass>;
let canvas: HTMLCanvasElement;

beforeEach(async () => {
  observers = [];
  audio = fakeAudioContextClass();
  vi.stubGlobal("AudioContext", audio.FakeAudioContext);
  vi.stubGlobal("ResizeObserver", FakeObserver);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(fakeCanvasContext);

  // audio-graph keeps one AudioContext per module instance; a fresh import gives each test its own.
  vi.resetModules();
  ({ createVisualiser } = await import("./visualiser"));
  canvas = document.createElement("canvas");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createVisualiser", () => {
  it("destroy twice is a no-op", () => {
    const { stream } = fakeStream();
    const vis = createVisualiser(canvas, { stream });

    vis.destroy();
    vis.destroy();

    expect(audio.suspend).toHaveBeenCalledTimes(1);
    expect(canvas.getAttribute("role")).toBeNull();
  });

  it("update after destroy throws", () => {
    const vis = createVisualiser(canvas);
    vis.destroy();

    expect(() => vis.update({ state: "recording" })).toThrow("audio-visualiser: update() after destroy()");
  });

  it("destroy does not stop the caller's tracks", () => {
    const { stream, track } = fakeStream();
    const vis = createVisualiser(canvas, { stream });

    vis.update({ stream: null });
    vis.update({ stream });
    vis.destroy();

    expect(track.stop).not.toHaveBeenCalled();
  });

  it("update with equal options does not re-tap the stream", () => {
    const { stream } = fakeStream();
    const vis = createVisualiser(canvas, { stream, variant: "timeline" });

    vis.update({ stream, variant: "timeline" });
    vis.update({ stream, variant: "timeline" });

    expect(audio.createMediaStreamSource).toHaveBeenCalledTimes(1);
  });

  it("omitted options reset to defaults", () => {
    const { stream } = fakeStream();
    const vis = createVisualiser(canvas);

    vis.update({ stream, state: "processing", label: "Transcribing" });
    expect(canvas.getAttribute("data-state")).toBe("processing");
    expect(canvas.getAttribute("aria-label")).toBe("Transcribing");

    vis.update({ stream });
    expect(canvas.getAttribute("data-state")).toBe("recording");
    expect(canvas.getAttribute("aria-label")).toBe("Recording audio");

    vis.update();
    expect(canvas.getAttribute("data-state")).toBe("idle");
  });

  it("destroy removes role, aria-label and data-state", () => {
    const vis = createVisualiser(canvas, { state: "connecting" });
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe("Connecting microphone");
    expect(canvas.getAttribute("data-state")).toBe("connecting");

    vis.destroy();

    expect(canvas.getAttribute("role")).toBeNull();
    expect(canvas.getAttribute("aria-label")).toBeNull();
    expect(canvas.getAttribute("data-state")).toBeNull();
    expect(canvas.style.contain).toBe("");
  });

  it("unknown variant throws without leaking", () => {
    const options = { variant: "bars" } as unknown as VisualiserOptions;

    expect(() => createVisualiser(canvas, options)).toThrow(
      new TypeError('audio-visualiser: unknown variant "bars" (expected one of: timeline)'),
    );

    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalled();
    expect(canvas.style.contain).toBe("");
    expect(canvas.getAttribute("role")).toBeNull();
  });

  it("unknown state throws naming the option", () => {
    const options = { state: "paused" } as unknown as VisualiserOptions;

    expect(() => createVisualiser(canvas, options)).toThrow(
      new TypeError(
        'audio-visualiser: unknown state "paused" (expected one of: idle, connecting, recording, processing, done, error)',
      ),
    );
    expect(canvas.getAttribute("data-state")).toBeNull();
  });

  it("update with unknown variant throws and leaves the visualiser unchanged", () => {
    const first = fakeStream();
    const second = fakeStream();
    const vis = createVisualiser(canvas, { stream: first.stream });
    const options = { stream: second.stream, state: "processing", variant: "bars" } as unknown as VisualiserOptions;

    expect(() => vis.update(options)).toThrow('audio-visualiser: unknown variant "bars"');

    expect(audio.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(audio.suspend).not.toHaveBeenCalled();
    expect(canvas.getAttribute("data-state")).toBe("recording");
    expect(canvas.getAttribute("aria-label")).toBe("Recording audio");
  });
});
