import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silverlila/audio-visualiser/react";

export default function Equaliser() {
  const mic = useMicrophone();
  const live = mic.status === "live";

  return (
    <>
      <AudioVisualiser
        variant="spectrum"
        stream={mic.stream}
        state={microphoneVisualState(mic)}
        style={{ height: 120 }}
      />
      <button type="button" onClick={live ? mic.stop : () => void mic.start()}>
        {live ? "Stop microphone" : "Start microphone"}
      </button>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
