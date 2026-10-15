import React from "react";
import { appendFinal, readResults } from "./speech";

const UNSUPPORTED_ERROR = "Speech Recognition is not supported in this browser.";

function getRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

export function useSpeechToText(
  props: {
    onInterimTranscript?: (transcript: string) => void;
    /** Receives each new final chunk, not the accumulated transcript. */
    onFinalTranscript?: (chunk: string) => void;
  } = {},
) {
  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const listeningRef = React.useRef(false);

  const [isSupported] = React.useState(() => getRecognitionConstructor() !== undefined);

  const [transcript, setTranscript] = React.useState("");
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [isListening, setIsListening] = React.useState(false);

  const [error, setError] = React.useState(isSupported ? "" : UNSUPPORTED_ERROR);

  const emitFinal = React.useEffectEvent((chunk: string) => {
    props.onFinalTranscript?.(chunk);
  });
  const emitInterim = React.useEffectEvent((text: string) => {
    props.onInterimTranscript?.(text);
  });

  React.useEffect(() => {
    const SpeechRecognition = getRecognitionConstructor();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      const { final, interim } = readResults(event.results, event.resultIndex);
      if (final) {
        setTranscript((previous) => appendFinal(previous, final));
        emitFinal(final);
      }
      setInterimTranscript(interim);
      emitInterim(interim);
    };

    recognition.onerror = (event) => {
      setError(`Error: ${event.error}`);
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    return () => {
      recognition.stop();
      recognitionRef.current = null;
      listeningRef.current = false;
    };
  }, []);

  return {
    isSupported,
    transcript,
    interimTranscript,
    isListening,
    error,
    start: () => {
      const recognition = recognitionRef.current;
      if (!recognition || listeningRef.current) return;
      setError("");
      recognition.start();
      listeningRef.current = true;
    },
    stop: () => recognitionRef.current?.stop(),
    discard: () => {
      recognitionRef.current?.stop();
      setTranscript("");
      setInterimTranscript("");
    },
  };
}
