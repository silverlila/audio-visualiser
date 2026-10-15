import React from "react";
import { AudioVisualiser, microphoneVisualState, useMicrophone } from "audio-visualiser/react";
import { useSpeechToText } from "./useSpeechToText";

function App() {
  const mic = useMicrophone();
  const SpeechAPI = useSpeechToText();

  return (
    <React.Fragment>
      <AudioVisualiser
        stream={mic.stream}
        state={microphoneVisualState(mic)}
        variant="timeline"
        aria-label="Microphone level"
        style={{ height: 64, color: "CanvasText" }}
      />

      {mic.error !== null && <p role="alert">{mic.error.message}</p>}
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
