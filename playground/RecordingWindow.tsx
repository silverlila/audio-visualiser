import type { ReactElement, ReactNode } from "react";
import { AudioVisualiser } from "@silverlila/audio-visualiser/react";
import type { VariantName, VisualState } from "@silverlila/audio-visualiser/react";

export function RecordingWindow(props: {
  readonly stream: MediaStream | null;
  readonly state: VisualState;
  readonly variant: VariantName;
  readonly "aria-label": string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={props.className === undefined ? "recording-window" : `recording-window ${props.className}`}>
      <div className="recording-window-viz">
        <AudioVisualiser stream={props.stream} state={props.state} variant={props.variant} aria-label={props["aria-label"]} />
      </div>
      <span className="recording-window-label" role="status">
        {props.children}
      </span>
    </div>
  );
}
