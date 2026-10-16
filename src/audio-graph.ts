/**
 * The one AudioContext every visualiser shares, and the analyser taps that read a stream's
 * waveform and spectrum from it.
 *
 * Safari may keep an AudioContext created after `await getUserMedia` suspended until a user
 * gesture, so the context is also resumed on the next pointerdown or keydown. Safari also stops
 * pulling an analyser that doesn't reach `destination`, so each tap's graph ends in a zero-gain
 * sink.
 *
 * `tapStream` calls `resume()` unconditionally: `suspend()` is asynchronous, so after the last
 * release `state` can still read "running" with a suspend queued.
 */
export const FFT_SIZE = 2048;

export interface AnalyserTap {
  readonly sampleRate: number;
  readonly fftSize: number;
  read(waveform: Float32Array<ArrayBuffer>, spectrumDb: Float32Array<ArrayBuffer>): void;
  release(): void;
}

let context: AudioContext | null = null;
let liveTaps = 0;
let gestureResumeArmed = false;

function sharedContext(): AudioContext {
  if (context === null) context = new AudioContext();
  return context;
}

function resumeOnNextGesture(ctx: AudioContext): void {
  if (gestureResumeArmed) return;
  gestureResumeArmed = true;
  const options = { once: true, capture: true } as const;
  const resume = () => {
    window.removeEventListener("pointerdown", resume, options);
    window.removeEventListener("keydown", resume, options);
    gestureResumeArmed = false;
    if (liveTaps > 0) void ctx.resume();
  };
  window.addEventListener("pointerdown", resume, options);
  window.addEventListener("keydown", resume, options);
}

export function tapStream(stream: MediaStream): AnalyserTap {
  const ctx = sharedContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(analyser);
  analyser.connect(sink);
  sink.connect(ctx.destination);

  liveTaps++;
  void ctx.resume();
  if (ctx.state !== "running") resumeOnNextGesture(ctx);

  let released = false;
  return {
    sampleRate: ctx.sampleRate,
    fftSize: FFT_SIZE,
    read(waveform, spectrumDb) {
      analyser.getFloatTimeDomainData(waveform);
      analyser.getFloatFrequencyData(spectrumDb);
    },
    release() {
      if (released) return;
      released = true;
      source.disconnect();
      analyser.disconnect();
      sink.disconnect();
      liveTaps--;
      if (liveTaps === 0) void ctx.suspend();
    },
  };
}
