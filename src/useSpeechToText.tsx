import React from "react";

export function useSpeechToText(
  props: {
    onInterimTranscript?: (transcript: string) => void;
    onFinalTranscript?: (transcript: string) => void;
  } = {}
) {
  const recognitionRef = React.useRef<SpeechRecognition | null>(null);

  const [isSupported, setIsSupported] = React.useState(false);

  const [transcript, setTranscript] = React.useState("");
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [isListening, setIsListening] = React.useState(false);

  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      // TODO need to rething this we need to get the current locale from browser
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        if (finalTranscript) {
          const finalText = transcript + finalTranscript + " ";
          setTranscript(finalText);
          props.onFinalTranscript?.(finalText);
        }
        setInterimTranscript(interimText);
        props.onInterimTranscript?.(interimText);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setError(`Error: ${event.error}`);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognition.onstart = () => {
        setIsListening(true);
        setError("");
      };
    } else {
      setIsSupported(false);
      setError("Speech Recognition is not supported in this browser.");
    }

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  return {
    isSupported,
    transcript,
    interimTranscript,
    isListening,
    error,
    start: () => recognitionRef.current?.start(),
    stop: () => recognitionRef.current?.stop(),
    discard: () => {
      recognitionRef.current?.stop();
      setTranscript("");
    },
  };
}
