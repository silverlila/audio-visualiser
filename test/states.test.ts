import { describe, it, expect } from "vitest";
import { VISUAL_STATES, createStateMix, createStateWeights, stateMix, stepStateWeights } from "../src/states";

describe("state weights", () => {
  it("state weights sum to 1 throughout a transition", () => {
    const weights = createStateWeights("idle");

    for (let step = 0; step < 60; step++) {
      stepStateWeights(weights, "processing", 16, 150);

      let sum = 0;
      for (const state of VISUAL_STATES) {
        expect(weights[state]).toBeGreaterThanOrEqual(0);
        expect(weights[state]).toBeLessThanOrEqual(1);
        sum += weights[state];
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
    expect(weights.processing).toBeGreaterThan(0.99);
  });

  it("an interrupted transition does not snap", () => {
    const weights = createStateWeights("idle");
    for (let step = 0; step < 5; step++) stepStateWeights(weights, "recording", 10, 150);
    const recordingBefore = weights.recording;

    stepStateWeights(weights, "done", 16, 150);

    expect(weights.recording).toBeLessThan(recordingBefore);
    expect(weights.recording).toBeGreaterThan(0);
  });

  it("a tau of 0 snaps to the target", () => {
    const weights = createStateWeights("idle");

    stepStateWeights(weights, "error", 16, 0);

    expect(weights).toEqual({ idle: 0, connecting: 0, recording: 0, processing: 0, done: 0, error: 1 });
  });
});

describe("state mix", () => {
  it("stateMix derives signal, breathe, shimmer and rest", () => {
    const weights = { idle: 0.1, connecting: 0.2, recording: 0.3, processing: 0.15, done: 0.15, error: 0.1 };
    const mix = createStateMix();

    stateMix(weights, mix);

    expect(mix.signal).toBeCloseTo(0.3, 9);
    expect(mix.breathe).toBeCloseTo(0.3, 9);
    expect(mix.shimmer).toBeCloseTo(0.25, 9);
    expect(mix.rest).toBeCloseTo(0.25, 9);
  });
});
