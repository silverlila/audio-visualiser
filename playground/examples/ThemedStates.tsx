import { useState } from "react";
import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silverlila/audio-visualiser/react";
import "./themedStates.css";

export default function ThemedStates() {
  const mic = useMicrophone();
  const [finished, setFinished] = useState(false);
  const state = finished ? "done" : microphoneVisualState(mic);
  const live = mic.status === "live";

  function toggle() {
    if (live) {
      mic.stop();
      setFinished(true);
    } else {
      setFinished(false);
      void mic.start();
    }
  }

  return (
    <>
      <AudioVisualiser className="themed" variant="pill" stream={mic.stream} state={state} style={{ width: 72, height: 24 }} />
      <AudioVisualiser className="themed" variant="timeline" stream={mic.stream} state={state} style={{ height: 48 }} />
      <button type="button" onClick={toggle}>
        {live ? "Stop" : "Start"}
      </button>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
