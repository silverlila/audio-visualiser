import { SHIMMER_PERIOD_MS } from "./draw";
import type { Frame, Variant } from "./frame";

const BAND_COUNT = 48;
const INNER_RADIUS = 0.3;
const REST_LENGTH = 0.04;
const MIN_REST_LENGTH = 1;
const BAR_FILL = 0.6;
const MIN_LINE_WIDTH = 1;
const MIN_GAP = 1;
const BREATHE_DEPTH = 0.04;
const BREATHE_RATE = 1 / 600;
const BREATHE_WAVES = 2;
const SHIMMER_SHARPNESS = 3;
const DIM_ALPHA = 0.35;
const TOP = -Math.PI / 2;

function bandForBar(i: number, barCount: number): number {
  const position = i < barCount / 2 ? 2 * i : 2 * (barCount - 1 - i) + 1;
  return Math.floor((position * BAND_COUNT) / barCount);
}

function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { width, height, bands, mix, ambientMs } = frame;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const inner = INNER_RADIUS * size;
  const circumference = 2 * Math.PI * inner;
  const lineWidth = Math.max(MIN_LINE_WIDTH, (BAR_FILL * circumference) / BAND_COUNT);
  const barCount = Math.max(1, Math.min(BAND_COUNT, Math.floor(circumference / (lineWidth + MIN_GAP))));
  const restLength = Math.max(MIN_REST_LENGTH, REST_LENGTH * size);
  const reach = Math.max(0, size / 2 - inner - restLength - lineWidth / 2);
  const breatheDepth = Math.min(BREATHE_DEPTH * size, reach);
  const rotation = (2 * Math.PI * (ambientMs % SHIMMER_PERIOD_MS)) / SHIMMER_PERIOD_MS;

  ctx.save();
  ctx.strokeStyle = frame.ink;
  ctx.lineCap = "round";
  ctx.lineWidth = lineWidth;
  for (let i = 0; i < barCount; i++) {
    const turn = (2 * Math.PI * i) / barCount;
    const signal = restLength + bands[bandForBar(i, barCount)] * reach * mix.signal;
    const wave = 0.5 + 0.5 * Math.sin(ambientMs * BREATHE_RATE + turn * BREATHE_WAVES);
    const live = signal + breatheDepth * wave * mix.breathe;
    const length = live + (restLength - live) * mix.rest;

    const glow = Math.pow(0.5 + 0.5 * Math.cos(turn - rotation), SHIMMER_SHARPNESS);
    ctx.globalAlpha = DIM_ALPHA + (1 - DIM_ALPHA) * (1 - mix.shimmer * (1 - glow));

    const angle = TOP + turn;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + inner * cos, cy + inner * sin);
    ctx.lineTo(cx + (inner + length) * cos, cy + (inner + length) * sin);
    ctx.stroke();
  }
  ctx.restore();
}

export const radial: Variant = { bands: BAND_COUNT, draw };
