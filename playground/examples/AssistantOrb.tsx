import { useState } from "react";
import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silverlila/audio-visualiser/react";

const askAssistant = () => new Promise<void>((resolve) => setTimeout(resolve, 1500));

export default function AssistantOrb() {
  const mic = useMicrophone();
  const [reply, setReply] = useState<"processing" | "done" | null>(null);

  function talk() {
    setReply(null);
    void mic.start();
  }

  async function send() {
    mic.stop();
    setReply("processing");
    await askAssistant();
    setReply((current) => (current === "processing" ? "done" : current));
  }

  const live = mic.status === "live";
  return (
    <>
      <AudioVisualiser
        variant="orb"
        stream={mic.stream}
        state={reply ?? microphoneVisualState(mic)}
        style={{ width: 160, height: 160 }}
      />
      <button type="button" onClick={live ? () => void send() : talk}>
        {live ? "Send" : "Talk"}
      </button>
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
