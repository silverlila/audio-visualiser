import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactElement } from "react";
import { AudioVisualiser, microphoneVisualState, useMicrophone } from "@silver/audio-visualiser/react";
import type { MicrophoneSnapshot, UseMicrophoneResult, VisualState } from "@silver/audio-visualiser/react";
import { LookControls, SourceControls, ThemeSwitch } from "./Controls";
import type { Look, SourceKind, Theme } from "./Controls";
import { Examples } from "./Examples";
import { Gallery } from "./Gallery";
import { Hero } from "./Hero";
import { RecordingWindow } from "./RecordingWindow";
import { SpeechPanel } from "./SpeechPanel";
import { createFileSource, createToneSource } from "./sources";
import type { FakeSource } from "./sources";

interface Playing {
  readonly source: FakeSource;
  readonly name: string;
}

type Feed = { readonly kind: "mic" } | { readonly kind: "tone" | "file"; readonly playing: Playing | null };

const FILE_UNPLAYABLE = "This file can't be played in this browser. Choose a different audio file.";

type DeviceChoice = { readonly deviceId?: string };

const DICTATION: readonly { readonly state: VisualState; readonly ms: number }[] = [
  { state: "connecting", ms: 600 },
  { state: "recording", ms: 4000 },
  { state: "processing", ms: 1500 },
  { state: "done", ms: 1200 },
];

const WINDOW_LABELS: Record<VisualState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  recording: "Listening",
  processing: "Transcribing…",
  done: "Done",
  error: "Microphone error",
};

const NO_MICROPHONE = { status: "idle", devices: [], error: null } as const satisfies Pick<
  MicrophoneSnapshot,
  "status" | "devices" | "error"
>;

const DEFAULT_LOOK: Look = { variant: "timeline", stateOverride: "auto", height: 64, ink: null };

function deviceChoice(deviceId: string): DeviceChoice {
  return deviceId === "" ? {} : { deviceId };
}

function autoState(feed: Feed, mic: Pick<MicrophoneSnapshot, "status">, stream: MediaStream | null): VisualState {
  if (feed.kind === "mic") return microphoneVisualState(mic);
  return stream === null ? "idle" : "recording";
}

function sourceOf(feed: Feed): FakeSource | null {
  return feed.kind === "mic" ? null : (feed.playing?.source ?? null);
}

function withoutSource(feed: Feed): Feed {
  return feed.kind === "mic" ? feed : { kind: feed.kind, playing: null };
}

function clearTimers(timers: Set<number>): void {
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

function MicrophoneHost(props: {
  readonly agc: boolean;
  readonly resume: DeviceChoice | null;
  readonly onChange: (mic: UseMicrophoneResult) => void;
}): null {
  const mic = useMicrophone({ audio: { autoGainControl: props.agc } });
  const [resume] = useState(props.resume);
  const { start } = mic;
  const { onChange } = props;

  useEffect(() => {
    if (resume !== null) void start(resume);
  }, [start, resume]);

  useEffect(() => {
    onChange(mic);
  }, [onChange, mic]);

  return null;
}

function App(): ReactElement {
  const [mic, setMic] = useState<UseMicrophoneResult | null>(null);
  const [agc, setAgc] = useState(true);
  const [resumeMic, setResumeMic] = useState<DeviceChoice | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [feed, setFeed] = useState<Feed>({ kind: "mic" });
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [theme, setTheme] = useState<Theme>("system");
  const [simulated, setSimulated] = useState<VisualState | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const timers = useRef(new Set<number>());

  const stream = feed.kind === "mic" ? (mic?.stream ?? null) : (sourceOf(feed)?.stream ?? null);
  const micSnapshot = mic ?? NO_MICROPHONE;
  const state = simulated ?? (look.stateOverride === "auto" ? autoState(feed, micSnapshot, stream) : look.stateOverride);

  const releaseSource = useEffectEvent(() => {
    sourceOf(feed)?.stop();
    setFeed(withoutSource);
  });
  useEffect(() => () => releaseSource(), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const pending = timers.current;
    return () => clearTimers(pending);
  }, []);

  function changeFeed(next: Feed): void {
    const outgoing = sourceOf(feed);
    if (outgoing !== null && outgoing !== sourceOf(next)) outgoing.stop();
    setFileError(null);
    setFeed(next);
  }

  function startTone(): void {
    if (feed.kind === "mic") mic?.stop();
    changeFeed({ kind: "tone", playing: { source: createToneSource(), name: "Test tone" } });
  }

  function playFile(file: File): void {
    const source = createFileSource(file);
    changeFeed({ kind: "file", playing: { source, name: file.name } });
    void source.started.catch(() => {
      source.stop();
      setFeed((current) => (sourceOf(current) === source ? withoutSource(current) : current));
      setFileError(FILE_UNPLAYABLE);
    });
  }

  function startMicrophone(): void {
    if (feed.kind !== "mic") changeFeed({ kind: "mic" });
    void mic?.start(deviceChoice(deviceId));
  }

  function selectSource(kind: SourceKind): void {
    if (kind === feed.kind) return;
    if (kind === "tone") {
      startTone();
      return;
    }
    if (feed.kind === "mic") mic?.stop();
    changeFeed(kind === "mic" ? { kind } : { kind, playing: null });
  }

  function toggleMicrophone(): void {
    if (mic?.status === "live") mic.stop();
    else startMicrophone();
  }

  function changeDevice(next: string): void {
    setDeviceId(next);
    mic?.stop();
    void mic?.start(deviceChoice(next));
  }

  function changeAgc(next: boolean): void {
    setResumeMic(mic?.status === "live" ? deviceChoice(deviceId) : null);
    setAgc(next);
  }

  function toggleTone(): void {
    if (feed.kind === "tone" && feed.playing !== null) changeFeed({ kind: "tone", playing: null });
    else startTone();
  }

  function toggleSimulation(): void {
    const pending = timers.current;
    if (pending.size > 0) {
      clearTimers(pending);
      setSimulated(null);
      return;
    }
    if (stream === null) startTone();
    let at = 0;
    for (const step of DICTATION) {
      pending.add(window.setTimeout(() => setSimulated(step.state), at));
      at += step.ms;
    }
    pending.add(
      window.setTimeout(() => {
        pending.clear();
        setSimulated(null);
      }, at),
    );
  }

  const inkStyle = look.ink === null ? undefined : { color: look.ink };

  return (
    <div className="page">
      <MicrophoneHost key={String(agc)} agc={agc} resume={resumeMic} onChange={setMic} />

      <header className="site-header">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} width="28" height="28" alt="" />
          audio-visualiser
        </div>
        <nav className="site-nav" aria-label="Sections">
          <a href="#playground">Playground</a>
          <a href="#examples">Examples</a>
          <a href="#speech">Speech to text</a>
        </nav>
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </header>

      <main className="sections">
        <Hero />

        <section id="playground" className="page-section" aria-labelledby="playground-heading">
          <div className="section-head">
            <h2 id="playground-heading" className="page-heading">
              Playground
            </h2>
            <p className="subtitle">Pick a source, then try every variant, state and colour.</p>
          </div>

          <div className="layout">
            <section className="card area-stage" aria-labelledby="preview-heading">
              <div className="card-head">
                <h3 id="preview-heading" className="section-title">
                  Preview
                </h3>
                <span className="badge">
                  <span className="state-dot" data-state={state} />
                  {look.variant} · {state}
                </span>
              </div>
              <div className="preview" style={{ ...inkStyle, height: look.height }}>
                <AudioVisualiser
                  stream={stream}
                  state={state}
                  variant={look.variant}
                  aria-label={`Preview, ${look.variant} visualiser, ${state}`}
                />
              </div>
            </section>

            <section className="card area-dictation" aria-label="Dictation simulation">
              <div className="dictation">
                <RecordingWindow stream={stream} state={state} variant="pill" aria-label="Recording window preview">
                  {WINDOW_LABELS[state]}
                </RecordingWindow>
                <button type="button" className="button button-primary" onClick={toggleSimulation}>
                  {simulated === null ? "Simulate dictation" : "Cancel simulation"}
                </button>
                <p className="hint">Connecting, then recording for 4 s, processing and done. Plays the test tone if nothing is live.</p>
              </div>
            </section>

            <aside className="card area-controls" aria-label="Controls">
              <SourceControls
                source={feed.kind}
                playing={feed.kind === "mic" ? null : (feed.playing?.name ?? null)}
                mic={micSnapshot}
                fileError={fileError}
                deviceId={deviceId}
                agc={agc}
                onSourceChange={selectSource}
                onMicToggle={toggleMicrophone}
                onDeviceChange={changeDevice}
                onAgcChange={changeAgc}
                onToneToggle={toggleTone}
                onFileChoose={playFile}
                onFileStop={() => changeFeed({ kind: "file", playing: null })}
              />
              <LookControls look={look} onChange={setLook} />
            </aside>

            <section className="card area-gallery" aria-labelledby="gallery-heading">
              <h3 id="gallery-heading" className="section-title">
                All variants
              </h3>
              <Gallery stream={stream} state={state} ink={look.ink} />
            </section>
          </div>
        </section>

        <section id="examples" className="page-section" aria-labelledby="examples-heading">
          <div className="section-head">
            <h2 id="examples-heading" className="page-heading">
              Examples
            </h2>
            <p className="subtitle">
              Each preview runs the code beside it, using the public API and your microphone. Copy the React or the vanilla
              version.
            </p>
          </div>
          <Examples />
        </section>

        <section id="speech" className="page-section" aria-labelledby="speech-heading">
          <div className="section-head">
            <h2 id="speech-heading" className="page-heading">
              Speech to text
            </h2>
            <p className="subtitle">
              Dictate with your browser's speech recognition. The window records while you speak, transcribes after Stop,
              then settles.
            </p>
          </div>
          <div className="card">
            <SpeechPanel
              stream={mic?.stream ?? null}
              mic={micSnapshot}
              onStart={startMicrophone}
              onStop={() => mic?.stop()}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
