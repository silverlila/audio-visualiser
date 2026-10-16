import { useEffect, useRef, useState } from "react";
import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silverlila/audio-visualiser/react";

export default function VoiceNote() {
  const mic = useMicrophone();
  const recorder = useRef<MediaRecorder | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => () => {
    if (note) URL.revokeObjectURL(note);
  }, [note]);

  async function record() {
    setNote(null);
    const { stream } = await mic.start();
    if (!stream) return;
    const chunks: Blob[] = [];
    recorder.current = new MediaRecorder(stream);
    recorder.current.ondataavailable = (event) => chunks.push(event.data);
    recorder.current.onstop = () => setNote(URL.createObjectURL(new Blob(chunks)));
    recorder.current.start();
  }

  function stop() {
    recorder.current?.stop();
    mic.stop();
  }

  const live = mic.status === "live";
  return (
    <>
      <AudioVisualiser
        variant="timeline"
        stream={mic.stream}
        state={note ? "done" : microphoneVisualState(mic)}
        style={{ height: 64 }}
      />
      <button type="button" disabled={mic.status === "requesting"} onClick={live ? stop : () => void record()}>
        {live ? "Stop" : "Record"}
      </button>
      {note && <audio controls src={note} />}
      {mic.error && <p role="alert">{mic.error.message}</p>}
    </>
  );
}
