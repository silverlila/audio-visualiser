/**
 * The speech-to-text demo: a recording window drawn from the microphone stream, Start/Stop and
 * Clear buttons, and the transcript.
 *
 * The Web Speech API opens its own audio capture, separate from the microphone stream drawn here.
 * A disabled button loses keyboard focus, so Clear and the Start/Stop button use `aria-disabled`.
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { microphoneVisualState } from "@silver/audio-visualiser/react";
import type { MicrophoneSnapshot, VisualState } from "@silver/audio-visualiser/react";
import { RecordingWindow } from "./RecordingWindow";
import { useSpeechToText } from "./useSpeechToText";

const SPEECH_ERRORS = new Map([
  ["Error: not-allowed", "Microphone access is blocked. Allow it in your browser's site settings, then press Start."],
  ["Error: no-speech", "No speech was heard. Check that your microphone is on and unmuted, then press Start."],
  ["Error: audio-capture", "No microphone was found. Connect one, then press Start."],
  ["Error: network", "The speech service could not be reached. Check your connection, then press Start."],
]);

function speechErrorMessage(error: string): string {
  return SPEECH_ERRORS.get(error) ?? error;
}

type Phase = "idle" | "listening" | "finishing" | "done";

const DONE_MS = 1200;

const PHASE_STATES: Record<Exclude<Phase, "listening">, VisualState> = {
  idle: "idle",
  finishing: "processing",
  done: "done",
};

const WINDOW_LABELS: Record<VisualState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  recording: "Listening",
  processing: "Transcribing…",
  done: "Done",
  error: "Stopped",
};

const BUTTON_LABELS: Record<Phase, string> = {
  idle: "Start",
  listening: "Stop",
  finishing: "Finishing…",
  done: "Start",
};

function dictationState(phase: Phase, mic: Pick<MicrophoneSnapshot, "status">, failed: boolean): VisualState {
  if (failed) return "error";
  if (phase !== "listening") return PHASE_STATES[phase];
  const micState = microphoneVisualState(mic);
  return micState === "idle" ? "connecting" : micState;
}

export function SpeechPanel(props: {
  readonly stream: MediaStream | null;
  readonly mic: Pick<MicrophoneSnapshot, "status">;
  readonly onStart: () => void;
  readonly onStop: () => void;
}): ReactElement {
  const [phase, setPhase] = useState<Phase>("idle");
  const speech = useSpeechToText({
    onEnd: () => {
      if (phase === "idle") return;
      setPhase("done");
      props.onStop();
    },
  });
  const isEmpty = speech.transcript === "" && speech.interimTranscript === "";
  const failed = speech.isSupported && speech.error !== "";
  const state = dictationState(phase, props.mic, failed);
  const finishing = phase === "finishing";

  useEffect(() => {
    if (phase !== "done") return;
    const id = window.setTimeout(() => setPhase("idle"), DONE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  function toggleListening(): void {
    if (phase === "listening") {
      speech.stop();
      props.onStop();
      setPhase("finishing");
    } else {
      speech.start();
      props.onStart();
      setPhase("listening");
    }
  }

  return (
    <div className="speech">
      <div className="speech-stage">
        <RecordingWindow
          className="recording-window-wide"
          stream={props.stream}
          state={state}
          variant="timeline"
          aria-label={`Dictation, ${state}`}
        >
          {WINDOW_LABELS[state]}
        </RecordingWindow>

        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            disabled={!speech.isSupported}
            aria-disabled={finishing}
            onClick={finishing ? undefined : toggleListening}
          >
            {BUTTON_LABELS[phase]}
          </button>
          <button
            type="button"
            className="button button-quiet"
            aria-disabled={isEmpty}
            onClick={isEmpty ? undefined : speech.discard}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="speech-text">
        <p className="hint">Your browser may send speech audio to its vendor's servers (Chrome sends it to Google).</p>
        {!speech.isSupported && (
          <p className="alert">Speech recognition is not available in this browser. Try Chrome, Edge or Safari.</p>
        )}
        {failed && (
          <p role="alert" className="alert">
            {speechErrorMessage(speech.error)}
          </p>
        )}

        <div className="transcript" aria-live="polite">
          {isEmpty ? (
            <span className="muted">Press Start and speak. The transcript builds up here.</span>
          ) : (
            <>
              {speech.transcript}
              {speech.interimTranscript !== "" && <span className="muted"> {speech.interimTranscript}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
