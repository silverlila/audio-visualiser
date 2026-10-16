import type { HistoryView } from "../history";
import type { StateMix, StateWeights, VisualState } from "../states";

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly ink: string;
  readonly accent: string;
  readonly level: number;
  readonly bands: ArrayLike<number>;
  readonly waveform: ArrayLike<number>;
  readonly history: HistoryView;
  readonly state: VisualState;
  readonly weights: StateWeights;
  readonly mix: StateMix;
  readonly ambientMs: number;
}

export interface Variant {
  readonly bands: number;
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void;
}
