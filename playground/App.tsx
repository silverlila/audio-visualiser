import React from "react";
import { useSpeechToText } from "./useSpeechToText";
import { useAudioVisualiser } from "./useAudioVisualiser";

function App() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const SpeechAPI = useSpeechToText();
  const AudioAPI = useAudioVisualiser(canvasRef);
  return (
    <React.Fragment>
      <canvas ref={canvasRef} width="800" height="50"></canvas>
      <br />

      <p>{SpeechAPI.transcript}</p>
      <p>{SpeechAPI.interimTranscript}</p>
      <button
        onClick={() => {
          SpeechAPI.start();
          AudioAPI.start();
        }}
      >
        Start recording
      </button>
      <button
        onClick={() => {
          SpeechAPI.stop();
          AudioAPI.stop();
        }}
      >
        Stop recording
      </button>
    </React.Fragment>
  );
}

export default App;
