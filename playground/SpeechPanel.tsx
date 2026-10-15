import type { ReactElement } from "react";
import { useSpeechToText } from "./useSpeechToText";

/** Plain sentences for the common recognition errors, keyed by the hook's `Error: <code>` string. */
const SPEECH_ERRORS = new Map([
  ["Error: not-allowed", "Microphone access is blocked. Allow it in your browser's site settings, then press Start."],
  ["Error: no-speech", "No speech was heard. Check that your microphone is on and unmuted, then press Start."],
  ["Error: audio-capture", "No microphone was found. Connect one, then press Start."],
  ["Error: network", "The speech service could not be reached. Check your connection, then press Start."],
]);

function speechErrorMessage(error: string): string {
  return SPEECH_ERRORS.get(error) ?? error;
}

/** Browser speech-to-text next to the visualisers. `onStart`/`onStop` drive the microphone source
 *  so the transcript and the visualiser run together; the Web Speech API opens its own capture. */
export function SpeechPanel(props: { readonly onStart: () => void; readonly onStop: () => void }): ReactElement {
  const speech = useSpeechToText();
  const isEmpty = speech.transcript === "" && speech.interimTranscript === "";

  function toggleListening(): void {
    if (speech.isListening) {
      speech.stop();
      props.onStop();
    } else {
      speech.start();
      props.onStart();
    }
  }

  return (
    <>
      <p className="hint">Your browser may send speech audio to its vendor's servers (Chrome sends it to Google).</p>

      {/* Start and Stop share one button, and Clear is only aria-disabled, so pressing either never
          strands keyboard focus on a disabled control. */}
      <div className="button-row">
        <button type="button" className="button" disabled={!speech.isSupported} onClick={toggleListening}>
          {speech.isListening ? "Stop" : "Start"}
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-disabled={isEmpty}
          onClick={isEmpty ? undefined : speech.discard}
        >
          Clear
        </button>
        {speech.isListening && (
          <span className="badge badge-live">
            <span className="state-dot" data-state="recording" />
            Listening
          </span>
        )}
      </div>

      {!speech.isSupported && (
        <p className="alert">Speech recognition is not available in this browser. Try Chrome, Edge or Safari.</p>
      )}
      {speech.isSupported && speech.error !== "" && (
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
    </>
  );
}
