/**
 * Pure signal maths: loudness and band levels from analyser data, envelope smoothing, and the
 * clock that turns elapsed time into whole sample periods.
 *
 * `SPECTRUM_RANGE` is on the dB scale of `AnalyserNode.getFloatFrequencyData`, which has a
 * different reference from the dBFS RMS scale of `LOUDNESS_RANGE`; don't mix them. FFT bin 0 is
 * DC.
 */
export interface DbRange {
  readonly floorDb: number;
  readonly ceilingDb: number;
}

export const LOUDNESS_RANGE: DbRange = { floorDb: -60, ceilingDb: -10 };
export const SPECTRUM_RANGE: DbRange = { floorDb: -100, ceilingDb: -30 };
export const BAND_MIN_HZ = 80;
export const BAND_MAX_HZ = 8000;

export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumOfSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

export function amplitudeToDb(amplitude: number): number {
  return 20 * Math.log10(amplitude);
}

export function normalizeDb(db: number, range: DbRange): number {
  const t = (db - range.floorDb) / (range.ceilingDb - range.floorDb);
  if (Number.isNaN(t) || t <= 0) return 0;
  return Math.min(t, 1);
}

export function stepEnvelope(
  current: number,
  target: number,
  dtMs: number,
  attackMs: number,
  releaseMs: number,
): number {
  if (dtMs <= 0) return current;
  const tau = target > current ? attackMs : releaseMs;
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dtMs / tau));
}

export interface BandLayout {
  readonly count: number;
  readonly startBin: Uint16Array;
  readonly endBin: Uint16Array;
}

export function logBandLayout(
  count: number,
  minHz: number,
  maxHz: number,
  sampleRate: number,
  fftSize: number,
): BandLayout {
  const binHz = sampleRate / fftSize;
  const binCount = fftSize / 2;
  const edgeBin = (edge: number): number => {
    const hz = minHz * (maxHz / minHz) ** (edge / count);
    return Math.min(Math.max(Math.round(hz / binHz), 1), binCount - 1);
  };

  const startBin = new Uint16Array(count);
  const endBin = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    startBin[i] = edgeBin(i);
    endBin[i] = Math.min(Math.max(edgeBin(i + 1), startBin[i] + 1), binCount);
  }
  return { count, startBin, endBin };
}

export function measureBands(
  spectrumDb: ArrayLike<number>,
  layout: BandLayout,
  out: Float32Array,
): void {
  if (out.length < layout.count) {
    throw new RangeError(
      `measureBands: out holds ${out.length} values but the layout has ${layout.count} bands`,
    );
  }
  const lastBin = layout.count > 0 ? layout.endBin[layout.count - 1] : 0;
  if (spectrumDb.length < lastBin) {
    throw new RangeError(
      `measureBands: spectrum holds ${spectrumDb.length} bins but the layout reads up to bin ${lastBin}`,
    );
  }

  for (let band = 0; band < layout.count; band++) {
    const start = layout.startBin[band];
    const end = layout.endBin[band];
    let powerSum = 0;
    for (let bin = start; bin < end; bin++) {
      powerSum += 10 ** (spectrumDb[bin] / 10);
    }
    const meanDb = 10 * Math.log10(powerSum / (end - start));
    out[band] = normalizeDb(meanDb, SPECTRUM_RANGE);
  }
}

export interface FixedClock {
  carryMs: number;
}

export function createFixedClock(): FixedClock {
  return { carryMs: 0 };
}

export function stepFixedClock(
  clock: FixedClock,
  dtMs: number,
  periodMs: number,
  maxGapMs: number,
): number {
  if (dtMs <= 0) return 0;
  if (dtMs > maxGapMs) {
    clock.carryMs = 0;
    return 0;
  }
  clock.carryMs += dtMs;
  const ticks = Math.floor(clock.carryMs / periodMs);
  clock.carryMs -= ticks * periodMs;
  return ticks;
}
