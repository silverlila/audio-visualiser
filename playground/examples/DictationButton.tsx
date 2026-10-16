import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silverlila/audio-visualiser/react";
import "./dictationButton.css";

export default function DictationButton() {
  const mic = useMicrophone();
  const live = mic.status === "live";

  return (
    <>
      <button
        type="button"
        className="dictation-button"
        onClick={live ? mic.stop : () => void mic.start()}
      >
        <AudioVisualiser
          variant="pill"
          stream={mic.stream}
          state={microphoneVisualState(mic)}
          style={{ width: 56, height: 20 }}
          aria-hidden
        />
        {live ? "Stop dictation" : "Dictate"}
      </button>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
