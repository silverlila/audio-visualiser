import type { ReactElement } from "react";
import { AudioVisualiser, VARIANTS } from "@silverlila/audio-visualiser/react";
import type { VisualState } from "@silverlila/audio-visualiser/react";

export function Gallery(props: {
  readonly stream: MediaStream | null;
  readonly state: VisualState;
  readonly ink: string | null;
}): ReactElement {
  return (
    <ul className="gallery" style={props.ink === null ? undefined : { color: props.ink }}>
      {VARIANTS.map((variant) => (
        <li key={variant} className="tile">
          <div className="tile-stage">
            <AudioVisualiser
              stream={props.stream}
              state={props.state}
              variant={variant}
              aria-label={`${variant} visualiser, ${props.state}`}
            />
          </div>
          <span className="tile-label">{variant}</span>
        </li>
      ))}
    </ul>
  );
}
