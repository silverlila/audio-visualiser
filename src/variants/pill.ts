import { roundedBar, SHIMMER_PERIOD_MS } from "./draw";
import type { Frame, Variant } from "./frame";

/** Band read by each bar, left to right: the lowest band in the middle, rising outward. */
const BAND_FOR_BAR = [3, 1, 0, 2, 4] as const;

// Sizes as fractions of the unit, which is the height unless the canvas is too narrow.
const DOT = 0.28;
const DOT_GAP = 0.16;
const BAR_WIDTH = 0.12;
const BAR_GAP = 0.08;
const BAR_REACH = 0.9;
const GROUP_WIDTH = DOT + DOT_GAP + BAND_FOR_BAR.length * BAR_WIDTH + (BAND_FOR_BAR.length - 1) * BAR_GAP;

const BREATHE_DEPTH = 0.2;
const BREATHE_RATE = 1 / 600; // radians per ms
const BREATHE_SPREAD = 0.9; // radians between neighbouring bars
const PULSE_DEPTH = 0.65;

/** Compact mini-view: an accent status dot followed by five rounded bars, centred as a group. */
function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, bands, mix, ambientMs } = frame;
  const unit = Math.min(height, width / GROUP_WIDTH);
  // Whole-pixel bars and spacing, rounded down so the group fits in unit · GROUP_WIDTH (until the
  // 1 px minimums take over on a canvas too small to matter).
  const barWidth = Math.max(1, Math.floor(BAR_WIDTH * unit));
  const barStep = Math.max(barWidth + 1, Math.floor((BAR_WIDTH + BAR_GAP) * unit));
  const barsOffset = Math.floor((DOT + DOT_GAP) * unit);
  const groupWidth = barsOffset + (BAND_FOR_BAR.length - 1) * barStep + barWidth;
  const left = Math.round((width - groupWidth) / 2);
  const middle = height / 2;

  ctx.save();
  const pulse = 0.5 + 0.5 * Math.cos((2 * Math.PI * ambientMs) / SHIMMER_PERIOD_MS);
  ctx.globalAlpha = 1 - mix.shimmer * PULSE_DEPTH * pulse;
  ctx.fillStyle = frame.accent;
  ctx.beginPath();
  ctx.arc(left + (DOT / 2) * unit, middle, (DOT / 2) * unit, 0, 2 * Math.PI);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = frame.ink;
  const barsLeft = left + barsOffset;
  for (let bar = 0; bar < BAND_FOR_BAR.length; bar++) {
    const signal = Math.max(barWidth, bands[BAND_FOR_BAR[bar]] * BAR_REACH * unit * mix.signal);
    const wave = 0.5 + 0.5 * Math.sin(ambientMs * BREATHE_RATE + bar * BREATHE_SPREAD);
    const live = signal + BREATHE_DEPTH * unit * wave * mix.breathe;
    const barHeight = live + (barWidth - live) * mix.rest;
    roundedBar(ctx, barsLeft + bar * barStep, middle - barHeight / 2, barWidth, barHeight);
  }
  ctx.restore();
}

export const pill: Variant = { bands: BAND_FOR_BAR.length, draw };
