/**
 * Stand-in audio sources for the playground, a synthetic voice-like tone and a played-back file,
 * each exposed as a `MediaStream`.
 *
 * Pausing an HTMLMediaElement before playback begins rejects `play()` with an AbortError.
 */

export interface FakeSource {
  readonly stream: MediaStream;
  stop(): void;
}

const VOICE_HZ = 140;
const VOICE_CUTOFF_HZ = 1800;
const SYLLABLE_HZ = 4;
const PHRASE_HZ = 0.3;

function newAudioContext(): AudioContext {
  return new AudioContext();
}

function pulse(ctx: AudioContext, hz: number): { readonly lfo: OscillatorNode; readonly gain: GainNode } {
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  lfo.connect(depth);
  depth.connect(gain.gain);
  return { lfo, gain };
}

export function createToneSource(createContext: () => AudioContext = newAudioContext): FakeSource {
  const ctx = createContext();

  const voice = ctx.createOscillator();
  voice.type = "sawtooth";
  voice.frequency.value = VOICE_HZ;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = VOICE_CUTOFF_HZ;

  const syllable = pulse(ctx, SYLLABLE_HZ);
  const phrase = pulse(ctx, PHRASE_HZ);
  const output = ctx.createMediaStreamDestination();

  voice.connect(lowpass);
  lowpass.connect(syllable.gain);
  syllable.gain.connect(phrase.gain);
  phrase.gain.connect(output);

  const oscillators = [voice, syllable.lfo, phrase.lfo];
  for (const oscillator of oscillators) oscillator.start();

  let stopped = false;
  return {
    stream: output.stream,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const oscillator of oscillators) oscillator.stop();
      void ctx.close();
    },
  };
}

export interface FileSource extends FakeSource {
  readonly started: Promise<void>;
}

export function createFileSource(file: File, createContext: () => AudioContext = newAudioContext): FileSource {
  const url = URL.createObjectURL(file);
  const element = new Audio(url);
  element.loop = true;

  const ctx = createContext();
  const source = ctx.createMediaElementSource(element);
  const output = ctx.createMediaStreamDestination();
  source.connect(ctx.destination);
  source.connect(output);

  let stopped = false;
  const started = element.play().catch((cause: unknown) => {
    if (!stopped) throw cause;
  });

  return {
    stream: output.stream,
    started,
    stop() {
      if (stopped) return;
      stopped = true;
      element.pause();
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      void ctx.close();
    },
  };
}
