export const SHIMMER_PERIOD_MS = 1600;
export const SHIMMER_HALF_WIDTH = 0.25;

export function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
}

export function shimmerCentre(ambientMs: number): number {
  const sweep = (ambientMs % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
  return -SHIMMER_HALF_WIDTH + sweep * (1 + 2 * SHIMMER_HALF_WIDTH);
}

export function shimmerAlpha(position01: number, ambientMs: number, strength: number): number {
  const distance = Math.abs(position01 - shimmerCentre(ambientMs)) / SHIMMER_HALF_WIDTH;
  const glow = distance >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * distance);
  return 1 - strength * (1 - glow);
}
