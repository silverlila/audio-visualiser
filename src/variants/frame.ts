import type { HistoryView } from "../history";
import type { StateMix, StateWeights, VisualState } from "../states";

/** Internal renderer contract (not exported from src/index.ts).
 *  Valid only during one draw() call; the object is reused every frame. */
export interface Frame {
  /** CSS px; ctx is DPR-scaled and cleared. */
  readonly width: number;
  readonly height: number;
  readonly ink: string;
  readonly accent: string;
  /** 0..1 enveloped. */
  readonly level: number;
  /** 0..1, length === variant.bands. */
  readonly bands: ArrayLike<number>;
  /** -1..1, zeros when no stream. */
  readonly waveform: ArrayLike<number>;
  readonly history: HistoryView;
  /** Target state, for discrete things. */
  readonly state: VisualState;
  readonly weights: StateWeights;
  /** stateMix(weights). */
  readonly mix: StateMix;
  /** Frozen under reduced motion. */
  readonly ambientMs: number;
}

export interface Variant {
  /** 0 = the variant reads no bands, so band measurement is skipped. */
  readonly bands: number;
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void;
}
