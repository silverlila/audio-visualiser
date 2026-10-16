/**
 * Tests for the playground's tone and file audio sources.
 *
 * In browsers, `play()` rejects with its own error unless `pause()` first rejects it with an
 * AbortError; `stubAudioElement` reproduces that.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createFileSource, createToneSource } from "../../playground/sources";

function fakeAudioContext() {
  const stream = { id: "tone-stream" };
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const node = () => ({ connect: vi.fn() });
  const param = () => ({ value: 0 });

  const ctx = {
    close: vi.fn(() => Promise.resolve()),
    createOscillator: () => {
      const oscillator = { ...node(), type: "sine", frequency: param(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(oscillator);
      return oscillator;
    },
    createBiquadFilter: () => ({ ...node(), type: "lowpass", frequency: param() }),
    createGain: () => ({ ...node(), gain: param() }),
    createMediaStreamDestination: () => ({ ...node(), stream }),
  };
  return { ctx, stream, oscillators };
}

function fakeFileAudioContext() {
  const node = () => ({ connect: vi.fn() });
  return {
    destination: node(),
    close: vi.fn(() => Promise.resolve()),
    createMediaElementSource: () => node(),
    createMediaStreamDestination: () => ({ ...node(), stream: { id: "file-stream" } }),
  } as unknown as AudioContext;
}

function stubAudioElement(playError: Error) {
  vi.stubGlobal("URL", { createObjectURL: () => "blob:fake", revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    "Audio",
    class {
      loop = false;
      private rejectPlay: (cause: Error) => void = () => {};
      play() {
        return new Promise<void>((_, reject) => {
          this.rejectPlay = reject;
          queueMicrotask(() => reject(playError));
        });
      }
      pause() {
        this.rejectPlay(new DOMException("The play() request was interrupted", "AbortError"));
      }
      removeAttribute() {}
      load() {}
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sources", () => {
  it("file source reports a file the browser cannot play", async () => {
    const unsupported = new DOMException("no supported source", "NotSupportedError");
    stubAudioElement(unsupported);

    const source = createFileSource(new File([], "noise.bin"), fakeFileAudioContext);

    await expect(source.started).rejects.toBe(unsupported);
  });

  it("file source stopped before playback begins is not a failure", async () => {
    stubAudioElement(new DOMException("no supported source", "NotSupportedError"));

    const source = createFileSource(new File([], "song.mp3"), fakeFileAudioContext);
    source.stop();

    await expect(source.started).resolves.toBeUndefined();
  });

  it("tone source exposes a stream and stop is idempotent", () => {
    const fake = fakeAudioContext();
    const source = createToneSource(() => fake.ctx as unknown as AudioContext);

    expect(source.stream).toBe(fake.stream);

    source.stop();
    source.stop();

    expect(fake.ctx.close).toHaveBeenCalledTimes(1);
    expect(fake.oscillators.length).toBeGreaterThan(0);
    for (const oscillator of fake.oscillators) expect(oscillator.stop).toHaveBeenCalledTimes(1);
  });
});
