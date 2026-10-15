import { SHIMMER_PERIOD_MS } from "./draw";
import type { Frame, Variant } from "./frame";

const BAND_COUNT = 8;
/** Points on the outline; enough that the polygon reads as a curve at any canvas size. */
const OUTLINE_POINTS = 64;
// Sizes as fractions of min(width, height). At full level and full bands the body reaches
// 0.30 · 1.25 + 0.05 = 0.425, and the accent arc's outer edge 0.425 + 0.035 + 0.04 / 2 = 0.48,
// inside the 0.5 half-size.
const BASE_RADIUS = 0.3;
const WOBBLE = 0.05;
const ARC_GAP = 0.035;
const ARC_WIDTH = 0.04;
const MIN_ARC_WIDTH = 1;
const LEVEL_GROWTH = 0.25;
const BREATHE_DEPTH = 0.04;
const BREATHE_PERIOD_MS = 700; // ms per radian
const ARC_SPAN = Math.PI / 2;
const TOP = -Math.PI / 2;

/** A filled circle that swells with loudness, its edge pushed out per angle by the bands
 *  (band 0 at the top, going clockwise), with a rotating accent arc while processing. */
function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, bands, level, mix, ambientMs } = frame;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const breathe = 1 + BREATHE_DEPTH * Math.sin(ambientMs / BREATHE_PERIOD_MS) * mix.breathe;
  const radius = BASE_RADIUS * size * (1 + LEVEL_GROWTH * level * mix.signal) * breathe;
  const wobble = WOBBLE * size * mix.signal;

  ctx.save();
  ctx.fillStyle = frame.ink;
  ctx.beginPath();
  for (let p = 0; p < OUTLINE_POINTS; p++) {
    // Cosine interpolation between neighbouring bands keeps the closed outline smooth.
    const position = (p * BAND_COUNT) / OUTLINE_POINTS;
    const band = Math.floor(position);
    const blend = 0.5 - 0.5 * Math.cos(Math.PI * (position - band));
    const from = bands[band];
    const to = bands[(band + 1) % BAND_COUNT];
    const r = radius + wobble * (from + (to - from) * blend);
    const angle = TOP + (2 * Math.PI * p) / OUTLINE_POINTS;
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();

  if (mix.shimmer > 0) {
    const start = TOP + (2 * Math.PI * (ambientMs % SHIMMER_PERIOD_MS)) / SHIMMER_PERIOD_MS;
    ctx.globalAlpha = mix.shimmer;
    ctx.strokeStyle = frame.accent;
    const arcWidth = Math.max(MIN_ARC_WIDTH, ARC_WIDTH * size);
    // On a tiny canvas the 1 px minimum width would push the arc past the edge; pull it in.
    const arcRadius = Math.max(0, Math.min(radius + wobble + ARC_GAP * size, size / 2 - arcWidth / 2));
    ctx.lineWidth = arcWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, arcRadius, start, start + ARC_SPAN);
    ctx.stroke();
  }
  ctx.restore();
}

export const orb: Variant = { bands: BAND_COUNT, draw };
