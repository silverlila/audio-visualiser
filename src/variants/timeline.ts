import { roundedBar, shimmerAlpha } from "./draw";
import type { Frame, Variant } from "./frame";

const BAR_WIDTH = 3;
const BAR_STEP = 5;
const MIN_HEIGHT = 2;
const BREATHE_DEPTH = 0.15;
const BREATHE_RATE = 1 / 600; // radians per ms
const BREATHE_SPREAD = 0.35; // radians between neighbouring bars
const DIM_ALPHA = 0.35;

/** Superwhisper-style scrolling history: the newest bar at the right edge, older bars to its
 *  left, all shifted by the scroll phase so the motion is continuous between samples. */
function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, history, mix, ambientMs } = frame;
  const barCount = Math.ceil(width / BAR_STEP) + 1;
  const shift = history.phase * BAR_STEP;
  const reach = height - MIN_HEIGHT;

  ctx.save();
  ctx.fillStyle = frame.ink;
  for (let age = 0; age < barCount; age++) {
    const x = width - BAR_WIDTH - age * BAR_STEP - shift;
    const signal = MIN_HEIGHT + history.at(age) * reach * mix.signal;
    const wave = 0.5 + 0.5 * Math.sin(ambientMs * BREATHE_RATE + age * BREATHE_SPREAD);
    const live = signal + BREATHE_DEPTH * height * wave * mix.breathe;
    const barHeight = live + (MIN_HEIGHT - live) * mix.rest;

    const centre01 = (x + BAR_WIDTH / 2) / width;
    ctx.globalAlpha = DIM_ALPHA + (1 - DIM_ALPHA) * shimmerAlpha(centre01, ambientMs, mix.shimmer);
    roundedBar(ctx, x, (height - barHeight) / 2, BAR_WIDTH, barHeight);
  }
  ctx.restore();
}

export const timeline: Variant = { bands: 0, draw };
