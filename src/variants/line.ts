import { SHIMMER_HALF_WIDTH, shimmerCentre } from "./draw";
import type { Frame, Variant } from "./frame";

const LINE_WIDTH = 2;
const POINT_SPACING = 3;
const SIGNAL_SCALE = 0.45;
/** Smallest peak the trace is normalised by, so near-silence is not blown up to full height. */
const PEAK_FLOOR = 0.02;
/** Share of the buffer searched for a rising zero crossing; the rest is the visible window. */
const TRIGGER_SEARCH = 0.25;
const BREATHE_AMPLITUDE = 0.08;
const BREATHE_RATE = 1 / 600; // radians per ms
/** Length of one breathing wave, in canvas heights, so it reads the same at any width. */
const BREATHE_WAVELENGTH = 4;
const DIM_ALPHA = 0.35;

/** Index of the first rising zero crossing in the first `searchLength` samples, or 0 when there
 *  is none, so the trace starts at the same phase every frame instead of jittering. */
function triggerIndex(waveform: ArrayLike<number>, searchLength: number): number {
  for (let i = 1; i < searchLength; i++) {
    if (waveform[i - 1] < 0 && waveform[i] >= 0) return i;
  }
  return 0;
}

/** Largest absolute sample in [start, end). */
function peakMagnitude(waveform: ArrayLike<number>, start: number, end: number): number {
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(waveform[i]));
  return peak;
}

/** The sample with the largest magnitude in [start, end), keeping its sign. */
function signedPeak(waveform: ArrayLike<number>, start: number, end: number): number {
  let peak = 0;
  for (let i = start; i < end; i++) {
    if (Math.abs(waveform[i]) > Math.abs(peak)) peak = waveform[i];
  }
  return peak;
}

/** Oscilloscope: a smooth stroke through the waveform, replaced by a slow sine while breathing.
 *  Each point shows the signed peak of its block of samples, normalised by the window's peak and
 *  scaled by the loudness, so speech fills the height without the shape aliasing. At rest both
 *  terms are zero, leaving a flat line along the midline. */
function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, waveform, level, mix, ambientMs } = frame;
  const middle = height / 2;
  const span = Math.max(0, width - 2 * LINE_WIDTH);
  const points = Math.max(2, Math.floor(width / POINT_SPACING));
  const searchLength = Math.floor(waveform.length * TRIGGER_SEARCH);
  const windowLength = waveform.length - searchLength;
  const start = triggerIndex(waveform, searchLength);
  const peak = Math.max(PEAK_FLOOR, peakMagnitude(waveform, start, start + windowLength));
  const signalScale = SIGNAL_SCALE * height * level * mix.signal;
  const breatheScale = BREATHE_AMPLITUDE * height * mix.breathe;
  const breatheK = height > 0 ? (2 * Math.PI) / (BREATHE_WAVELENGTH * height) : 0;

  ctx.save();
  ctx.beginPath();
  let prevX = 0;
  let prevY = 0;
  for (let k = 0; k < points; k++) {
    const x = LINE_WIDTH + (span * k) / (points - 1);
    const blockStart = start + Math.floor((windowLength * k) / points);
    const blockEnd = Math.max(blockStart + 1, start + Math.floor((windowLength * (k + 1)) / points));
    const sample = windowLength > 0 ? signedPeak(waveform, blockStart, blockEnd) : 0;
    // |sample| <= peak, so the trace stays within ±SIGNAL_SCALE of the height.
    const y = middle - (sample / peak) * signalScale - breatheScale * Math.sin(ambientMs * BREATHE_RATE + x * breatheK);
    if (k === 0) {
      ctx.moveTo(x, y);
    } else {
      // Curve through each sample towards the midpoint of the next segment.
      ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
    }
    prevX = x;
    prevY = y;
  }
  ctx.lineTo(prevX, prevY);

  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = frame.ink;
  ctx.globalAlpha = 1 - mix.shimmer * (1 - DIM_ALPHA);
  ctx.stroke();

  if (mix.shimmer > 0) {
    // Re-stroke the same path with a highlight that fades to transparent on both sides; outside
    // the gradient's span the end colour (transparent) extends, so nothing else brightens.
    const centre = shimmerCentre(ambientMs) * width;
    const halfWidth = SHIMMER_HALF_WIDTH * width;
    const highlight = ctx.createLinearGradient(centre - halfWidth, 0, centre + halfWidth, 0);
    highlight.addColorStop(0, "transparent");
    highlight.addColorStop(0.5, frame.ink);
    highlight.addColorStop(1, "transparent");
    ctx.strokeStyle = highlight;
    ctx.globalAlpha = mix.shimmer;
    ctx.stroke();
  }
  ctx.restore();
}

export const line: Variant = { bands: 0, draw };
