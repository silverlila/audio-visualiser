import { roundedBar, shimmerAlpha } from "./draw";
import type { Frame, Variant } from "./frame";

const BAND_COUNT = 32;
const GAP = 1;
const MIN_BAR_WIDTH = 2;
/** Narrowest slot (bar plus gap), in CSS px, so every bar stays a crisp column. */
const MIN_SLOT = MIN_BAR_WIDTH + GAP;
const REACH = 0.9;
/** Resting bar height as a fraction of the canvas height, capped at the bar width (a dot). */
const REST_HEIGHT = 0.08;
const BREATHE_DEPTH = 0.15;
const BREATHE_RATE = 1 / 600; // radians per ms
const BREATHE_SPREAD = 0.3; // radians between neighbouring bars, so the wave travels outward
const DIM_ALPHA = 0.35;

/** Mirrored spectrum: the lowest band at the centre, rising bands outward to both edges, every
 *  bar growing up and down from the midline. A narrow canvas draws fewer, whole-pixel bars and
 *  samples the bands across them. */
function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, bands, mix, ambientMs } = frame;
  const perSide = Math.max(1, Math.min(BAND_COUNT, Math.floor(width / 2 / MIN_SLOT)));
  const slot = Math.max(MIN_SLOT, Math.floor(width / 2 / perSide));
  const barWidth = slot - GAP;
  // Whole-pixel left edge of the row, which spans 2·perSide slots less the trailing gap.
  const rowLeft = Math.floor((width - (2 * perSide * slot - GAP)) / 2);
  const restHeight = Math.min(barWidth, REST_HEIGHT * height);
  const reach = Math.max(0, REACH * height - restHeight);

  ctx.save();
  ctx.fillStyle = frame.ink;
  for (let i = 0; i < perSide; i++) {
    const band = bands[Math.floor((i * BAND_COUNT) / perSide)];
    const signal = restHeight + band * reach * mix.signal;
    const wave = 0.5 + 0.5 * Math.sin(ambientMs * BREATHE_RATE - i * BREATHE_SPREAD);
    const live = signal + BREATHE_DEPTH * height * wave * mix.breathe;
    const barHeight = live + (restHeight - live) * mix.rest;
    const y = (height - barHeight) / 2;

    // The shimmer sweeps from the centre out to both edges, matching the mirror.
    const outward01 = (i + 0.5) / perSide;
    ctx.globalAlpha = DIM_ALPHA + (1 - DIM_ALPHA) * shimmerAlpha(outward01, ambientMs, mix.shimmer);
    roundedBar(ctx, rowLeft + (perSide + i) * slot, y, barWidth, barHeight);
    roundedBar(ctx, rowLeft + (perSide - 1 - i) * slot, y, barWidth, barHeight);
  }
  ctx.restore();
}

export const spectrum: Variant = { bands: BAND_COUNT, draw };
