import { describe, it, expect } from "vitest";
import {
  LOUDNESS_RANGE,
  amplitudeToDb,
  createFixedClock,
  logBandLayout,
  measureBands,
  normalizeDb,
  rms,
  stepEnvelope,
  stepFixedClock,
} from "../src/signal";

describe("loudness", () => {
  it("rms of a full-scale sine is 1/sqrt(2)", () => {
    const sine = new Float32Array(4800);
    for (let n = 0; n < sine.length; n++) {
      sine[n] = Math.sin((2 * Math.PI * 440 * n) / 48000);
    }
    expect(rms(sine)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("rms of silence is 0 and amplitudeToDb(0) is -Infinity", () => {
    expect(rms(new Float32Array(128))).toBe(0);
    expect(rms([])).toBe(0);
    expect(amplitudeToDb(0)).toBe(-Infinity);
  });

  it("normalizeDb clamps to 0..1", () => {
    expect(normalizeDb(-60, LOUDNESS_RANGE)).toBe(0);
    expect(normalizeDb(-10, LOUDNESS_RANGE)).toBe(1);
    expect(normalizeDb(-35, LOUDNESS_RANGE)).toBe(0.5);
    expect(normalizeDb(-80, LOUDNESS_RANGE)).toBe(0);
    expect(normalizeDb(0, LOUDNESS_RANGE)).toBe(1);
    expect(normalizeDb(-Infinity, LOUDNESS_RANGE)).toBe(0);
    expect(normalizeDb(NaN, LOUDNESS_RANGE)).toBe(0);
  });
});

describe("envelope", () => {
  it("stepEnvelope result depends on elapsed time, not call count", () => {
    const oneStep = stepEnvelope(0, 1, 32, 25, 250);
    const twoSteps = stepEnvelope(stepEnvelope(0, 1, 16, 25, 250), 1, 16, 25, 250);
    expect(twoSteps).toBeCloseTo(oneStep, 9);
  });

  it("stepEnvelope attacks faster than it releases", () => {
    const rise = stepEnvelope(0, 1, 16, 25, 250);
    const fall = 1 - stepEnvelope(1, 0, 16, 25, 250);
    expect(rise).toBeCloseTo(0.4727, 4);
    expect(fall).toBeCloseTo(0.062, 4);
  });

  it("stepEnvelope holds without elapsed time and jumps with a zero time constant", () => {
    expect(stepEnvelope(0.3, 1, 0, 25, 250)).toBe(0.3);
    expect(stepEnvelope(0.3, 1, -5, 25, 250)).toBe(0.3);
    expect(stepEnvelope(0.3, 1, 16, 0, 250)).toBe(1);
  });
});

describe("bands", () => {
  it("logBandLayout gives every band at least one bin", () => {
    for (const sampleRate of [48000, 44100]) {
      for (const count of [5, 8, 32, 48]) {
        const layout = logBandLayout(count, 80, 8000, sampleRate, 2048);
        expect(layout.count).toBe(count);
        for (let i = 0; i < count; i++) {
          expect(layout.endBin[i]).toBeGreaterThan(layout.startBin[i]);
          expect(layout.startBin[i]).toBeGreaterThanOrEqual(1);
          expect(layout.endBin[i]).toBeLessThanOrEqual(1024);
          if (i > 0) expect(layout.startBin[i]).toBeGreaterThanOrEqual(layout.startBin[i - 1]);
        }
      }
    }
  });

  it("logBandLayout spans 80 Hz to 8 kHz in bins", () => {
    const layout = logBandLayout(8, 80, 8000, 48000, 2048);
    expect(layout.startBin[0]).toBe(3);
    expect(layout.endBin[7]).toBe(341);
  });

  it("measureBands maps a flat spectrum at the ceiling to 1 and at the floor to 0", () => {
    const layout = logBandLayout(8, 80, 8000, 48000, 2048);
    const out = new Float32Array(8);

    measureBands(new Float32Array(1024).fill(-30), layout, out);
    for (const value of out) expect(value).toBeCloseTo(1, 6);

    measureBands(new Float32Array(1024).fill(-100), layout, out);
    for (const value of out) expect(value).toBeCloseTo(0, 6);
  });

  it("measureBands reads silent bins (-Infinity dB) as 0", () => {
    const layout = logBandLayout(4, 80, 8000, 48000, 2048);
    const out = new Float32Array(4).fill(0.5);
    measureBands(new Float32Array(1024).fill(-Infinity), layout, out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it("measureBands rejects buffers too small for the layout", () => {
    const layout = logBandLayout(8, 80, 8000, 48000, 2048);
    expect(() => measureBands(new Float32Array(1024), layout, new Float32Array(7))).toThrow(
      RangeError,
    );
    expect(() => measureBands(new Float32Array(100), layout, new Float32Array(8))).toThrow(
      RangeError,
    );
  });
});

describe("fixed clock", () => {
  function ticksOverOneSecond(stepMs: number, steps: number): number {
    const clock = createFixedClock();
    let ticks = 0;
    for (let i = 0; i < steps; i++) ticks += stepFixedClock(clock, stepMs, 45, 250);
    return ticks;
  }

  it("stepFixedClock ticks the same at 60 Hz and 120 Hz", () => {
    expect(ticksOverOneSecond(16.667, 60)).toBe(22);
    expect(ticksOverOneSecond(8.333, 120)).toBe(22);
  });

  it("stepFixedClock drops the backlog after a long gap", () => {
    const clock = createFixedClock();
    expect(stepFixedClock(clock, 30, 45, 250)).toBe(0);
    expect(stepFixedClock(clock, 5000, 45, 250)).toBe(0);
    expect(clock.carryMs).toBe(0);
    expect(stepFixedClock(clock, 20, 45, 250)).toBe(0);
    expect(stepFixedClock(clock, 25, 45, 250)).toBe(1);
  });

  it("stepFixedClock ignores non-positive steps", () => {
    const clock = createFixedClock();
    stepFixedClock(clock, 30, 45, 250);
    expect(stepFixedClock(clock, 0, 45, 250)).toBe(0);
    expect(stepFixedClock(clock, -10, 45, 250)).toBe(0);
    expect(clock.carryMs).toBe(30);
  });
});
