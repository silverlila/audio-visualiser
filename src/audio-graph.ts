export const FFT_SIZE = 2048;

export interface AnalyserTap {
  readonly sampleRate: number;
  readonly fftSize: number;
  /** Fills preallocated buffers: waveform length FFT_SIZE, spectrumDb length FFT_SIZE/2. */
  read(waveform: Float32Array<ArrayBuffer>, spectrumDb: Float32Array<ArrayBuffer>): void;
  /** Idempotent. Disconnects this tap's nodes. Never closes the shared context. */
  release(): void;
}

/** Created on the first tap and never closed, so no caller can close it twice (bug 4). */
let context: AudioContext | null = null;
let liveTaps = 0;
let gestureResumeArmed = false;

function sharedContext(): AudioContext {
  if (context === null) context = new AudioContext();
  return context;
}

/** Autoplay fallback: Safari may keep a context created after `await getUserMedia`
 *  suspended until the next user gesture. */
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

/** Taps `stream` into the shared context: source -> analyser -> silent gain -> destination.
 *  The silent sink keeps the graph pulled in Safari. The stream's tracks are never stopped. */
export function tapStream(stream: MediaStream): AnalyserTap {
  const ctx = sharedContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0; // display.ts owns all smoothing
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(analyser);
  analyser.connect(sink);
  sink.connect(ctx.destination);

  liveTaps++;
  // Always resume: a suspend() queued by the last release may not have landed yet,
  // so `state` can still read "running" while the context is about to suspend.
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
