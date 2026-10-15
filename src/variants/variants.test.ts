import { describe, it, expect } from "vitest";
import { createHistory } from "../history";
import { createStateMix, createStateWeights, stateMix, VISUAL_STATES } from "../states";
import type { StateWeights } from "../states";
import type { Frame } from "./frame";
import { RENDERERS, VARIANTS } from "./index";
import type { VariantName } from "./index";

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A 2D context that records every method call and property write, as "set <prop>". */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const gradient = {
    addColorStop: (...args: unknown[]) => calls.push({ name: "addColorStop", args }),
  };
  const written: Record<string, unknown> = {};
  const proxy = new Proxy(written, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return prop === "createLinearGradient" ? gradient : undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        calls.push({ name: `set ${prop}`, args: [value] });
        target[prop] = value;
      }
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

/** Arguments a real canvas rejects (by throwing or silently ignoring the call). */
function invalidArguments(calls: readonly Call[]): string[] {
  const problems: string[] = [];
  for (const { name, args } of calls) {
    const numbers = args.filter((a): a is number => typeof a === "number");
    if (numbers.some((n) => !Number.isFinite(n))) problems.push(`${name} got a non-finite number`);
    if (name === "arc" && Number(args[2]) < 0) problems.push("arc got a negative radius");
    if (name === "roundRect" && Number(args[4]) < 0) problems.push("roundRect got a negative radius");
    if (name === "set globalAlpha" && !(Number(args[0]) >= 0 && Number(args[0]) <= 1)) {
      problems.push(`globalAlpha ${String(args[0])} is outside 0..1`);
    }
    if (name === "set lineWidth" && !(Number(args[0]) > 0)) problems.push("lineWidth is not positive");
    if (name === "addColorStop" && !(Number(args[0]) >= 0 && Number(args[0]) <= 1)) {
      problems.push("addColorStop offset is outside 0..1");
    }
  }
  return problems;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Paint {
  readonly kind: "fill" | "stroke";
  readonly alpha: number;
  /** Bounds of the path's geometry: arcs count as their whole circle, curves by their control points. */
  readonly path: Box;
  /** The pixels the paint can touch: the path grown by half the line width for a stroke. */
  readonly ink: Box;
}

interface Replay {
  readonly paints: readonly Paint[];
  /** Context state left changed or changed outside a save/restore pair. */
  readonly leaks: readonly string[];
}

function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function extend(box: Box, x: number, y: number): void {
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x);
  box.maxY = Math.max(box.maxY, y);
}

/** Plays the recorded calls back through a model of the canvas: the save/restore stack, the
 *  alpha and line width in force, and the bounds of the current path at each fill and stroke. */
function replay(calls: readonly Call[]): Replay {
  const paints: Paint[] = [];
  const leaks: string[] = [];
  const saved: { alpha: number; lineWidth: number }[] = [];
  let alpha = 1;
  let lineWidth = 1;
  let path = emptyBox();
  for (const { name, args } of calls) {
    const n = args.map(Number);
    if (name.startsWith("set ") && saved.length === 0) leaks.push(`${name} outside save/restore`);
    if (name === "save") saved.push({ alpha, lineWidth });
    if (name === "restore") {
      const top = saved.pop();
      if (top === undefined) leaks.push("restore without a matching save");
      else ({ alpha, lineWidth } = top);
    }
    if (name === "set globalAlpha") alpha = n[0];
    if (name === "set lineWidth") lineWidth = n[0];
    if (name === "beginPath") path = emptyBox();
    if (name === "moveTo" || name === "lineTo") extend(path, n[0], n[1]);
    if (name === "quadraticCurveTo") {
      extend(path, n[0], n[1]);
      extend(path, n[2], n[3]);
    }
    if (name === "roundRect") {
      extend(path, n[0], n[1]);
      extend(path, n[0] + n[2], n[1] + n[3]);
    }
    if (name === "arc") {
      extend(path, n[0] - n[2], n[1] - n[2]);
      extend(path, n[0] + n[2], n[1] + n[2]);
    }
    if (name === "fill") paints.push({ kind: "fill", alpha, path: { ...path }, ink: { ...path } });
    if (name === "stroke") {
      const half = lineWidth / 2;
      const ink = { minX: path.minX - half, minY: path.minY - half, maxX: path.maxX + half, maxY: path.maxY + half };
      paints.push({ kind: "stroke", alpha, path: { ...path }, ink });
    }
  }
  if (saved.length !== 0) leaks.push(`save depth ${saved.length} at the end of the draw`);
  return { paints, leaks };
}

/** A visible paint big enough to see: a fill at least 1 px in both directions, or a stroke whose
 *  path spans at least 1 px. */
function hasRealExtent({ kind, alpha, path }: Paint): boolean {
  if (alpha <= 0) return false;
  const w = path.maxX - path.minX;
  const h = path.maxY - path.minY;
  return kind === "fill" ? w >= 1 && h >= 1 : Math.max(w, h) >= 1;
}

const EPSILON = 1e-6;

function insideCanvas({ ink }: Paint, width: number, height: number): boolean {
  return ink.minX >= -EPSILON && ink.minY >= -EPSILON && ink.maxX <= width + EPSILON && ink.maxY <= height + EPSILON;
}

const SIZES = [
  [24, 24],
  [300, 64],
  [24, 64],
  [64, 24],
] as const;

/** Containers animating open from 0 pass through sizes under 1 px. */
const SUB_PIXEL_SIZES = [
  [0.5, 0.5],
  [0.5, 24],
  [24, 0.9],
] as const;

const AMBIENT_MS = [0, 12_345.6];

/** Halfway through a transition from recording to processing. */
const MID_TRANSITION: StateWeights = { ...createStateWeights("recording"), recording: 0.5, processing: 0.5 };

function makeFrame(
  variant: VariantName,
  width: number,
  height: number,
  weights: StateWeights,
  ambientMs: number,
  bandAt: (i: number) => number = (i) => (i % 4) / 3,
): Frame {
  const bands = new Float32Array(RENDERERS[variant].bands);
  for (let i = 0; i < bands.length; i++) bands[i] = bandAt(i);
  const waveform = new Float32Array(2048);
  for (let i = 0; i < waveform.length; i++) waveform[i] = Math.sin(i / 10);
  const history = createHistory(64);
  for (let i = 0; i < 64; i++) history.push((i % 5) / 4);
  const mix = createStateMix();
  stateMix(weights, mix);
  return {
    width,
    height,
    ink: "rgb(20, 20, 20)",
    accent: "rgb(0, 100, 255)",
    level: 1,
    bands,
    waveform,
    history,
    state: "recording",
    weights,
    mix,
    ambientMs,
  };
}

/** Every combination of variant, size, state (plus one mid-transition blend) and ambient time. */
function* cases(
  sizes: readonly (readonly [number, number])[] = SIZES,
): Generator<{ label: string; variant: VariantName; frame: Frame }> {
  const blends: [string, StateWeights][] = VISUAL_STATES.map((s) => [s, createStateWeights(s)]);
  blends.push(["recording->processing", MID_TRANSITION]);
  for (const variant of VARIANTS) {
    for (const [width, height] of sizes) {
      for (const [blend, weights] of blends) {
        for (const ambientMs of AMBIENT_MS) {
          yield {
            label: `${variant} ${width}x${height} ${blend} @${ambientMs}ms`,
            variant,
            frame: makeFrame(variant, width, height, weights, ambientMs),
          };
        }
      }
    }
  }
}

/** Every pure state, and every pair of states crossfading just after the start and halfway. */
function crossfades(): [string, StateWeights][] {
  const blends: [string, StateWeights][] = VISUAL_STATES.map((s) => [s, createStateWeights(s)]);
  for (const from of VISUAL_STATES) {
    for (const to of VISUAL_STATES) {
      if (from === to) continue;
      for (const t of [0.01, 0.5]) {
        const weights = createStateWeights(from);
        weights[from] = 1 - t;
        weights[to] = t;
        blends.push([`${from}->${to}@${t}`, weights]);
      }
    }
  }
  return blends;
}

/** Ambient times that put the slow breathing sines at their peak as well as elsewhere. */
const PEAK_AMBIENT_MS = [0, 12_345.6, 700 * (Math.PI / 2), 600 * (Math.PI / 2)];

/** The timeline scrolls its history off the left edge by design, so it is not held to the bounds. */
const BOUNDED_VARIANTS = VARIANTS.filter((v) => v !== "timeline");

describe("variants", () => {
  it("every variant draws every state at small and wide sizes with arguments a canvas accepts", () => {
    const problems: string[] = [];
    for (const { label, variant, frame } of cases([...SIZES, ...SUB_PIXEL_SIZES])) {
      const { ctx, calls } = recordingContext();
      RENDERERS[variant].draw(ctx, frame);
      for (const problem of invalidArguments(calls)) problems.push(`${label}: ${problem}`);
    }
    expect(problems).toEqual([]);
  });

  it("every variant paints something at least 1 px across in every state, never an empty canvas", () => {
    const empty: string[] = [];
    for (const { label, variant, frame } of cases()) {
      const { ctx, calls } = recordingContext();
      RENDERERS[variant].draw(ctx, frame);
      if (!replay(calls).paints.some(hasRealExtent)) empty.push(label);
    }
    expect(empty).toEqual([]);
  });

  it("every variant changes context state only inside save/restore and restores all of it", () => {
    const leaks: string[] = [];
    for (const { label, variant, frame } of cases()) {
      const { ctx, calls } = recordingContext();
      RENDERERS[variant].draw(ctx, frame);
      for (const leak of replay(calls).leaks) leaks.push(`${label}: ${leak}`);
    }
    expect(leaks).toEqual([]);
  });

  it("no variant paints outside the canvas at full level, full bands and any crossfade", () => {
    const overflows: string[] = [];
    for (const variant of BOUNDED_VARIANTS) {
      for (const [width, height] of SIZES) {
        for (const [blend, weights] of crossfades()) {
          for (const ambientMs of PEAK_AMBIENT_MS) {
            const frame = makeFrame(variant, width, height, weights, ambientMs, () => 1);
            const { ctx, calls } = recordingContext();
            RENDERERS[variant].draw(ctx, frame);
            const outside = replay(calls).paints.filter((p) => !insideCanvas(p, width, height));
            if (outside.length > 0) {
              const { ink } = outside[0];
              const box = [ink.minX, ink.minY, ink.maxX, ink.maxY].map((v) => v.toFixed(2)).join(", ");
              overflows.push(`${variant} ${width}x${height} ${blend} @${ambientMs.toFixed(1)}ms: ${box}`);
            }
          }
        }
      }
    }
    expect(overflows).toEqual([]);
  });

  it("pill and spectrum place their bars on whole CSS pixels", () => {
    const fractional: string[] = [];
    for (const { label, variant, frame } of cases()) {
      if (variant !== "pill" && variant !== "spectrum") continue;
      const { ctx, calls } = recordingContext();
      RENDERERS[variant].draw(ctx, frame);
      for (const { name, args } of calls) {
        if (name !== "roundRect") continue;
        const [x, , w] = args.map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(w)) fractional.push(`${label}: x ${x}, w ${w}`);
      }
    }
    expect(fractional).toEqual([]);
  });

  it("radial leaves at least 1 px between neighbouring bars at the inner ring", () => {
    const crowded: string[] = [];
    for (const { label, variant, frame } of cases()) {
      if (variant !== "radial") continue;
      const { ctx, calls } = recordingContext();
      RENDERERS[variant].draw(ctx, frame);
      const starts = calls.filter((c) => c.name === "moveTo").map((c) => c.args.map(Number));
      const lineWidth = Number(calls.find((c) => c.name === "set lineWidth")?.args[0]);
      const inner = Math.hypot(starts[0][0] - frame.width / 2, starts[0][1] - frame.height / 2);
      const needed = starts.length * (lineWidth + 1);
      const available = 2 * Math.PI * inner;
      if (needed > available + EPSILON) crowded.push(`${label}: ${starts.length} bars need ${needed.toFixed(1)} px of ${available.toFixed(1)}`);
    }
    expect(crowded).toEqual([]);
  });

  describe("line", () => {
    /** A 200-sample sine at speech-like amplitude, starting `phase` radians into its cycle. */
    function speech(amplitude: number, phase: number): Float32Array {
      const samples = new Float32Array(2048);
      for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * i) / 200 + phase);
      return samples;
    }

    /** The y of every point the trace passes through (curve end points included). */
    function traceYs(waveform: Float32Array, level: number): number[] {
      const frame = { ...makeFrame("line", 300, 64, createStateWeights("recording"), 0), waveform, level };
      const { ctx, calls } = recordingContext();
      RENDERERS.line.draw(ctx, frame);
      const ys: number[] = [];
      for (const { name, args } of calls) {
        if (name === "moveTo") ys.push(Number(args[1]));
        if (name === "quadraticCurveTo") ys.push(Number(args[3]));
      }
      return ys;
    }

    it("normal speech fills a sensible part of the height and stays within ±0.45·h", () => {
      const ys = traceYs(speech(0.1, 0), 0.6);
      const spread = Math.max(...ys) - Math.min(...ys);
      expect(spread).toBeGreaterThan(0.25 * 64);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(32 - 0.45 * 64);
      expect(Math.max(...ys)).toBeLessThanOrEqual(32 + 0.45 * 64);
    });

    it("holds the trace still when the same wave arrives at a different phase", () => {
      const a = traceYs(speech(0.1, 0), 0.6);
      const b = traceYs(speech(0.1, 1.3), 0.6);
      const drift = Math.max(...a.map((y, i) => Math.abs(y - b[i])));
      expect(drift).toBeLessThan(1.5);
    });
  });
});
