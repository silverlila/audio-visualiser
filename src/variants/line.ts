/**
 * The `line` variant: the waveform drawn as a trace across the canvas.
 *
 * Canvas gradients extend their first and last stop colours past the gradient's span, so a
 * gradient with transparent end stops highlights only the area between them.
 */
import { SHIMMER_HALF_WIDTH, shimmerCentre } from "./draw";
import type { Frame, Variant } from "./frame";

const LINE_WIDTH = 2;
const POINT_SPACING = 3;
const SIGNAL_SCALE = 0.45;
const PEAK_FLOOR = 0.02;
const TRIGGER_SEARCH = 0.25;
const BREATHE_AMPLITUDE = 0.08;
const BREATHE_RATE = 1 / 600;
const BREATHE_WAVELENGTH = 4;
const DIM_ALPHA = 0.35;

function triggerIndex(waveform: ArrayLike<number>, searchLength: number): number {
  for (let i = 1; i < searchLength; i++) {
    if (waveform[i - 1] < 0 && waveform[i] >= 0) return i;
  }
  return 0;
}

function peakMagnitude(waveform: ArrayLike<number>, start: number, end: number): number {
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(waveform[i]));
  return peak;
}

function signedPeak(waveform: ArrayLike<number>, start: number, end: number): number {
  let peak = 0;
  for (let i = start; i < end; i++) {
    if (Math.abs(waveform[i]) > Math.abs(peak)) peak = waveform[i];
  }
  return peak;
}

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
    const y = middle - (sample / peak) * signalScale - breatheScale * Math.sin(ambientMs * BREATHE_RATE + x * breatheK);
    if (k === 0) {
      ctx.moveTo(x, y);
    } else {
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
