import React from "react";
import { createMicrophone, createVisualiser, microphoneVisualState } from "audio-visualiser";
import { useSpeechToText } from "./useSpeechToText";

function App() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [mic] = React.useState(() => createMicrophone());
  const [snap, setSnap] = React.useState(() => mic.getSnapshot());
  const SpeechAPI = useSpeechToText();

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const vis = createVisualiser(canvas);
    const unsubscribe = mic.subscribe((next) => {
      setSnap(next);
      vis.update({ stream: next.stream, state: microphoneVisualState(next), variant: "timeline" });
    });
    return () => {
      unsubscribe();
      vis.destroy();
    };
  }, [mic]);

  return (
    <React.Fragment>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 64, color: "CanvasText" }} />

      {snap.error !== null && <p role="alert">{snap.error.message}</p>}
      <p>{SpeechAPI.transcript}</p>
      <p>{SpeechAPI.interimTranscript}</p>
      <button
        onClick={() => {
          SpeechAPI.start();
          void mic.start();
        }}
      >
        Start recording
      </button>
      <button
        onClick={() => {
          SpeechAPI.stop();
          mic.stop();
        }}
      >
        Stop recording
      </button>
    </React.Fragment>
  );
}

export default App;
