/** A stand-in for a microphone. `stop` is idempotent and never touches anyone else's AudioContext. */
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

/** A gain stage whose gain swings 0..1 at `hz`: a sine LFO of depth 0.5 added to a base of 0.5. */
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

/** Speech-like test signal: sawtooth ~140 Hz -> lowpass 1800 Hz -> gain driven by a 4 Hz "syllable"
 *  LFO times a slow 0.3 Hz phrase LFO -> MediaStreamAudioDestinationNode. Owns its own AudioContext. */
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
  /** Resolves once playback begins, or when the source is stopped first. Rejects with the browser's
   *  error when it cannot play the file. */
  readonly started: Promise<void>;
}

/** Loops the file through an <audio> element -> MediaElementSource -> speakers + MediaStreamDestination. */
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
  // Pausing before playback begins rejects play() with an AbortError; that is this source being
  // stopped, not a failure. Anything else (an undecodable file) rejects `started` for the caller.
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
