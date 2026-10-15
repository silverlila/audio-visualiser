const SHIMMER_PERIOD_MS = 1600;
/** Half-width of the highlight, as a fraction of the canvas width. */
const SHIMMER_HALF_WIDTH = 0.25;

/** Fills a rect whose short side is fully rounded. */
export function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
}

/** 0..1 brightness at `position01` (0 = left edge) of a highlight that sweeps left to right
 *  once every SHIMMER_PERIOD_MS. Strength 0 gives 1 everywhere; strength 1 gives 1 under the
 *  highlight, falling to 0 away from it. */
export function shimmerAlpha(position01: number, ambientMs: number, strength: number): number {
  const sweep = (ambientMs % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
  // The centre travels from just off the left edge to just off the right one.
  const centre = -SHIMMER_HALF_WIDTH + sweep * (1 + 2 * SHIMMER_HALF_WIDTH);
  const distance = Math.abs(position01 - centre) / SHIMMER_HALF_WIDTH;
  const glow = distance >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * distance);
  return 1 - strength * (1 - glow);
}
