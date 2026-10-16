import { SHIMMER_PERIOD_MS } from "./draw";
import type { Frame, Variant } from "./frame";

const BAND_COUNT = 8;
const OUTLINE_POINTS = 64;
const BASE_RADIUS = 0.3;
const WOBBLE = 0.05;
const ARC_GAP = 0.035;
const ARC_WIDTH = 0.04;
const MIN_ARC_WIDTH = 1;
const LEVEL_GROWTH = 0.25;
const BREATHE_DEPTH = 0.04;
const BREATHE_PERIOD_MS = 700;
const ARC_SPAN = Math.PI / 2;
const TOP = -Math.PI / 2;

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
