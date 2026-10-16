import { FFT_SIZE, tapStream } from "./audio-graph";
import type { AnalyserTap } from "./audio-graph";
import { createDisplay } from "./display";
import type { DisplayInput } from "./display";
import {
  BAND_MAX_HZ,
  BAND_MIN_HZ,
  LOUDNESS_RANGE,
  amplitudeToDb,
  logBandLayout,
  measureBands,
  normalizeDb,
  rms,
} from "./signal";
import type { BandLayout } from "./signal";
import { VISUAL_STATES, createStateMix, defaultLabel, stateMix } from "./states";
import type { VisualState } from "./states";
import { createSurface } from "./surface";
import { RENDERERS, VARIANTS } from "./variants";
import type { VariantName } from "./variants";
import type { Frame } from "./variants/frame";

export interface VisualiserOptions {
  /** The caller owns the stream; the visualiser never stops its tracks. */
  readonly stream?: MediaStream | null;
  /** Default: "recording" when stream is set, else "idle". */
  readonly state?: VisualState;
  /** Default: "timeline". */
  readonly variant?: VariantName;
  /** The canvas's aria-label. Default: a description of the state. */
  readonly label?: string;
}

export interface Visualiser {
  /** Replaces all options; an omitted option returns to its default. Throws after destroy(). */
  update(options?: VisualiserOptions): void;
  /** Idempotent. Stops drawing and clears the canvas; the stream keeps running. */
  destroy(): void;
}

interface ResolvedOptions {
  readonly stream: MediaStream | null;
  readonly state: VisualState;
  readonly variant: VariantName;
  readonly label: string;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

function assertOneOf(option: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new TypeError(`audio-visualiser: unknown ${option} "${value}" (expected one of: ${allowed.join(", ")})`);
  }
}

function resolveOptions(options: VisualiserOptions): ResolvedOptions {
  const stream = options.stream ?? null;
  const state = options.state ?? (stream === null ? "idle" : "recording");
  const variant = options.variant ?? "timeline";
  assertOneOf("state", state, VISUAL_STATES);
  assertOneOf("variant", variant, VARIANTS);
  return {
    stream,
    state,
    variant,
    label: options.label ?? defaultLabel(state),
  };
}

/** Draws live audio from `options.stream` onto `canvas`, one animation frame at a time,
 *  while the canvas is visible. Allocates everything up front; frames allocate nothing. */
export function createVisualiser(canvas: HTMLCanvasElement, options: VisualiserOptions = {}): Visualiser {
  let current = resolveOptions(options);
  let destroyed = false;
  let tap: AnalyserTap | null = null;
  let tappedStream: MediaStream | null = null;
  let layout: BandLayout | null = null;
  let layoutSampleRate = 0;
  let rafId: number | null = null;
  let lastTime: number | null = null;

  const display = createDisplay(RENDERERS[current.variant].bands, current.state);
  const waveform = new Float32Array(FFT_SIZE);
  const spectrumDb = new Float32Array(FFT_SIZE / 2);
  let bandTargets = new Float32Array(display.bands.length);
  const mix = createStateMix();
  const input: Writable<DisplayInput> = {
    target: current.state,
    loudness: 0,
    bandTargets: null,
    reducedMotion: false,
  };
  const frame: Writable<Frame> = {
    width: 0,
    height: 0,
    ink: "",
    accent: "",
    level: 0,
    bands: display.bands,
    waveform,
    history: display.history,
    state: current.state,
    weights: display.weights,
    mix,
    ambientMs: 0,
  };
  const surface = createSurface(canvas, syncLoop);

  function syncTap(stream: MediaStream | null): void {
    if (stream === tappedStream) return;
    tap?.release();
    tap = null;
    tappedStream = null;
    if (stream === null) {
      waveform.fill(0);
      return;
    }
    tap = tapStream(stream);
    tappedStream = stream;
  }

  function syncBands(variant: VariantName): void {
    const count = RENDERERS[variant].bands;
    if (count !== bandTargets.length) {
      display.setBandCount(count);
      bandTargets = new Float32Array(count);
    }
    if (tap === null || count === 0) {
      layout = null;
    } else if (layout === null || layout.count !== count || layoutSampleRate !== tap.sampleRate) {
      layout = logBandLayout(count, BAND_MIN_HZ, BAND_MAX_HZ, tap.sampleRate, tap.fftSize);
      layoutSampleRate = tap.sampleRate;
    }
  }

  function apply(next: ResolvedOptions): void {
    syncTap(next.stream);
    syncBands(next.variant);
    surface.setAccessibility(next.state, next.label);
    current = next;
  }

  function syncLoop(): void {
    if (surface.active && !destroyed) {
      if (rafId !== null) return;
      lastTime = null;
      rafId = requestAnimationFrame(renderFrame);
    } else if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function renderFrame(now: number): void {
    rafId = requestAnimationFrame(renderFrame);
    const dt = lastTime === null ? 0 : now - lastTime;
    lastTime = now;

    input.loudness = 0;
    input.bandTargets = null;
    if (tap !== null) {
      tap.read(waveform, spectrumDb);
      input.loudness = normalizeDb(amplitudeToDb(rms(waveform)), LOUDNESS_RANGE);
      if (layout !== null) {
        measureBands(spectrumDb, layout, bandTargets);
        input.bandTargets = bandTargets;
      }
    }
    input.target = current.state;
    input.reducedMotion = surface.reducedMotion;
    display.step(input, dt);

    surface.beginFrame();
    const colors = surface.readColors();
    stateMix(display.weights, mix);
    frame.width = surface.width;
    frame.height = surface.height;
    frame.ink = colors.ink;
    frame.accent = colors.accent;
    frame.level = display.level;
    frame.bands = display.bands;
    frame.state = current.state;
    frame.ambientMs = display.ambientMs;
    RENDERERS[current.variant].draw(surface.ctx, frame);
  }

  const visualiser: Visualiser = {
    update(next = {}) {
      if (destroyed) throw new Error("audio-visualiser: update() after destroy()");
      apply(resolveOptions(next));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      tap?.release();
      tap = null;
      tappedStream = null;
      surface.dispose();
    },
  };

  try {
    apply(current);
  } catch (error) {
    visualiser.destroy();
    throw error;
  }
  return visualiser;
}
