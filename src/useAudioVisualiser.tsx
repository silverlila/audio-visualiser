/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";

export function useAudioVisualiser(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const dataArrayRef = React.useRef<Uint8Array | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const historyRef = React.useRef<number[]>([]);

  const [isListening, setIsListening] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const drawVisualization = (numberOfBars: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const barWidth = width / numberOfBars;
    const barGap = 2;

    ctx.clearRect(0, 0, width, height);

    historyRef.current.forEach((value, i) => {
      const barHeight = Math.max(3, (value / 255) * (height / 2));
      const x = i * barWidth;
      const y = centerY - barHeight / 2;

      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, barWidth - barGap, barHeight);
    });
  };

  const start = async () => {
    try {
      setIsLoading(true);

      const canvas = canvasRef.current;
      if (!canvas) {
        setError("Canvas not ready");
        setIsLoading(false);
        return;
      }

      const numberOfBars = Math.floor(canvas.width / 6);
      historyRef.current = new Array(numberOfBars).fill(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

      const updateAudioData = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);

        const newSample = dataArrayRef.current[20];
        historyRef.current = [...historyRef.current.slice(1), newSample];

        drawVisualization(numberOfBars);

        animationFrameRef.current = requestAnimationFrame(updateAudioData);
      };

      animationFrameRef.current = requestAnimationFrame(updateAudioData);

      setIsListening(true);
      setIsLoading(false);
    } catch (error: any) {
      setError(error.message);
      setIsListening(false);
      setIsLoading(false);
    }
  };

  const stop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    audioContextRef.current?.close();

    setIsListening(false);
  };

  React.useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return {
    isLoading,
    isListening,
    error,
    start,
    stop,
  };
}
