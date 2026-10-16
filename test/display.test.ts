import { describe, it, expect } from "vitest";
import { createDisplay } from "../src/display";
import type { Display, DisplayInput } from "../src/display";

const QUIET: DisplayInput = { target: "idle", loudness: 0, bandTargets: null, reducedMotion: false };

function run(display: Display, input: DisplayInput, totalMs: number, dtMs: number): void {
  const steps = Math.round(totalMs / dtMs);
  for (let i = 0; i < steps; i++) display.step(input, dtMs);
}

function snapshot(display: Display) {
  return {
    level: display.level,
    bands: Array.from(display.bands),
    historyLength: display.history.length,
    phase: display.history.phase,
    weights: { ...display.weights },
    ambientMs: display.ambientMs,
  };
}

describe("display", () => {
  it("history fills at the same rate at 60 Hz and 120 Hz", () => {
    const at60 = createDisplay(0, "recording");
    const at120 = createDisplay(0, "recording");
    const input: DisplayInput = { ...QUIET, target: "recording", loudness: 0.5 };

    run(at60, input, 2000, 16.667);
    run(at120, input, 2000, 8.333);

    expect(at60.history.length).toBe(44);
    expect(Math.abs(at60.history.length - at120.history.length)).toBeLessThanOrEqual(1);
  });

  it("level attacks fast and releases slowly", () => {
    const display = createDisplay(0, "recording");

    run(display, { ...QUIET, loudness: 1 }, 50, 10);
    expect(display.level).toBeGreaterThan(0.8);

    run(display, { ...QUIET, loudness: 0 }, 50, 10);
    expect(display.level).toBeGreaterThan(0.5);
  });

  it("reduced motion snaps weights and freezes ambient", () => {
    const display = createDisplay(0, "idle");
    display.step(QUIET, 16);
    const ambientBefore = display.ambientMs;

    display.step({ ...QUIET, target: "recording", reducedMotion: true }, 16);

    expect(display.weights.recording).toBe(1);
    expect(display.weights.idle).toBe(0);
    expect(ambientBefore).toBe(16);
    expect(display.ambientMs).toBe(16);
  });

  it("bands decay to 0 without targets", () => {
    const display = createDisplay(3, "recording");
    run(display, { ...QUIET, bandTargets: [1, 1, 1] }, 200, 10);
    for (const band of display.bands) expect(band).toBeGreaterThan(0.9);

    run(display, QUIET, 3000, 10);

    for (const band of display.bands) expect(band).toBeLessThan(1e-4);
  });

  it("step with dt 0 changes nothing", () => {
    const display = createDisplay(2, "idle");
    run(display, { ...QUIET, loudness: 0.5, bandTargets: [0.5, 0.5] }, 100, 10);
    const before = snapshot(display);

    display.step({ target: "error", loudness: 1, bandTargets: [1, 1], reducedMotion: false }, 0);

    expect(snapshot(display)).toEqual(before);
  });

  it("step with a non-finite dt changes nothing", () => {
    const display = createDisplay(2, "idle");
    run(display, { ...QUIET, loudness: 0.5, bandTargets: [0.5, 0.5] }, 100, 10);
    const before = snapshot(display);
    const input: DisplayInput = { target: "error", loudness: 1, bandTargets: [1, 1], reducedMotion: false };

    display.step(input, NaN);
    display.step(input, Infinity);

    expect(snapshot(display)).toEqual(before);
  });

  it("step rejects band targets shorter than the band count", () => {
    const display = createDisplay(3, "recording");

    expect(() => display.step({ ...QUIET, bandTargets: [1, 1] }, 16)).toThrow(RangeError);
  });

  it("setBandCount reallocates bands starting at 0", () => {
    const display = createDisplay(2, "recording");
    run(display, { ...QUIET, bandTargets: [1, 1] }, 100, 10);
    const same = display.bands;

    display.setBandCount(2);
    expect(display.bands).toBe(same);

    display.setBandCount(4);
    expect(Array.from(display.bands)).toEqual([0, 0, 0, 0]);
  });
});
