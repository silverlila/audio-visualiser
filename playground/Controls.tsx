/**
 * The playground's control panels: choosing a source (microphone, tone or file), the Look
 * settings, and the theme switch.
 *
 * A disabled button loses keyboard focus, so pending actions use `aria-disabled` and keep focus.
 * Browsers fire no `change` on `<input type=file>` when the same file is chosen again unless its
 * `value` is reset.
 */
import { useId } from "react";
import type { ReactElement } from "react";
import { VARIANTS, VISUAL_STATES } from "@silverlila/audio-visualiser/react";
import type { MicrophoneSnapshot, VariantName, VisualState } from "@silverlila/audio-visualiser/react";

export type SourceKind = "mic" | "tone" | "file";
export type Theme = "system" | "light" | "dark";

export interface Look {
  readonly variant: VariantName;
  readonly stateOverride: VisualState | "auto";
  readonly height: number;
  readonly ink: string | null;
}

const HEIGHT_RANGE = { min: 24, max: 200 } as const;

interface Option<T> {
  readonly value: T;
  readonly label: string;
}

const SOURCE_OPTIONS: readonly Option<SourceKind>[] = [
  { value: "mic", label: "Microphone" },
  { value: "tone", label: "Test tone" },
  { value: "file", label: "Audio file" },
];

const THEME_OPTIONS: readonly Option<Theme>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const VARIANT_OPTIONS: readonly Option<VariantName>[] = VARIANTS.map((value) => ({ value, label: value }));

const STATE_OPTIONS: readonly Option<VisualState | "auto">[] = [
  { value: "auto", label: "auto" },
  ...VISUAL_STATES.map((value) => ({ value, label: value })),
];

const INK_OPTIONS: readonly Option<string | null>[] = [
  { value: null, label: "Theme" },
  { value: "oklch(0.56 0.2 268)", label: "Indigo" },
  { value: "oklch(0.6 0.11 195)", label: "Teal" },
  { value: "oklch(0.64 0.17 38)", label: "Coral" },
  { value: "oklch(0.56 0.21 305)", label: "Violet" },
];

function ChipGroup<T>(props: {
  readonly legend: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly hideLegend?: boolean;
}): ReactElement {
  const name = useId();
  return (
    <fieldset className="field">
      <legend className={props.hideLegend ? "visually-hidden" : "field-label"}>{props.legend}</legend>
      <div className="chips">
        {props.options.map((option) => (
          <label key={option.label} className="chip">
            <input
              type="radio"
              name={name}
              checked={option.value === props.value}
              onChange={() => props.onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ThemeSwitch(props: { readonly theme: Theme; readonly onChange: (theme: Theme) => void }): ReactElement {
  return <ChipGroup legend="Theme" hideLegend options={THEME_OPTIONS} value={props.theme} onChange={props.onChange} />;
}

export interface SourceControlsProps {
  readonly source: SourceKind;
  readonly playing: string | null;
  readonly mic: Pick<MicrophoneSnapshot, "status" | "devices" | "error">;
  readonly fileError: string | null;
  readonly deviceId: string;
  readonly agc: boolean;
  readonly onSourceChange: (source: SourceKind) => void;
  readonly onMicToggle: () => void;
  readonly onDeviceChange: (deviceId: string) => void;
  readonly onAgcChange: (agc: boolean) => void;
  readonly onToneToggle: () => void;
  readonly onFileChoose: (file: File) => void;
  readonly onFileStop: () => void;
}

const MIC_BUTTON_LABEL: Record<MicrophoneSnapshot["status"], string> = {
  idle: "Start microphone",
  requesting: "Connecting…",
  live: "Stop microphone",
  error: "Try again",
};

function MicrophoneControls(props: SourceControlsProps): ReactElement {
  const { mic } = props;
  const deviceSelectId = useId();
  const devices = mic.devices.filter((device) => device.id !== "");
  const requesting = mic.status === "requesting";
  return (
    <>
      <button
        type="button"
        className="button"
        aria-disabled={requesting}
        onClick={requesting ? undefined : props.onMicToggle}
      >
        {MIC_BUTTON_LABEL[mic.status]}
      </button>
      <div className="field">
        <label className="field-label" htmlFor={deviceSelectId}>
          Input device
        </label>
        <select
          id={deviceSelectId}
          className="select"
          value={props.deviceId}
          onChange={(event) => props.onDeviceChange(event.target.value)}
        >
          <option value="">Default microphone</option>
          {devices.map((device, index) => (
            <option key={device.id} value={device.id}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
        {devices.length === 0 && <p className="hint">Start the microphone once to list your devices.</p>}
      </div>
      <label className="check">
        <input type="checkbox" checked={props.agc} onChange={(event) => props.onAgcChange(event.target.checked)} />
        <span>
          Automatic gain control
          <span className="hint">Evens out loudness. Changing it while live reopens the microphone.</span>
        </span>
      </label>
    </>
  );
}

function ToneControls(props: SourceControlsProps): ReactElement {
  return (
    <>
      <button type="button" className="button" onClick={props.onToneToggle}>
        {props.playing === null ? "Play tone" : "Stop tone"}
      </button>
      <p className="hint">A synthetic voice-like hum with syllables and pauses. It is not played aloud.</p>
    </>
  );
}

function FileControls(props: SourceControlsProps): ReactElement {
  return (
    <>
      <div className="button-row">
        <label className="button file-button">
          <input
            type="file"
            accept="audio/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) props.onFileChoose(file);
            }}
          />
          {props.playing === null ? "Choose audio file…" : "Choose another…"}
        </label>
        {props.playing !== null && (
          <button type="button" className="button" onClick={props.onFileStop}>
            Stop
          </button>
        )}
      </div>
      <p className="hint truncate">
        {props.playing === null ? "The file loops through your speakers." : `Looping ${props.playing}`}
      </p>
    </>
  );
}

const SOURCE_CONTROLS: Record<SourceKind, (props: SourceControlsProps) => ReactElement> = {
  mic: MicrophoneControls,
  tone: ToneControls,
  file: FileControls,
};

export function SourceControls(props: SourceControlsProps): ReactElement {
  const Specific = SOURCE_CONTROLS[props.source];
  return (
    <section className="panel-section" aria-labelledby="source-heading">
      <h3 id="source-heading" className="section-title">
        Source
      </h3>
      <ChipGroup legend="Audio source" hideLegend options={SOURCE_OPTIONS} value={props.source} onChange={props.onSourceChange} />
      {props.mic.error !== null && (
        <p role="alert" className="alert">
          {props.mic.error.message}
        </p>
      )}
      {props.fileError !== null && (
        <p role="alert" className="alert">
          {props.fileError}
        </p>
      )}
      <Specific {...props} />
    </section>
  );
}

export function LookControls(props: { readonly look: Look; readonly onChange: (look: Look) => void }): ReactElement {
  const { look, onChange } = props;
  const heightId = useId();
  const inkName = useId();
  return (
    <section className="panel-section" aria-labelledby="look-heading">
      <h3 id="look-heading" className="section-title">
        Look
      </h3>
      <ChipGroup
        legend="Variant"
        options={VARIANT_OPTIONS}
        value={look.variant}
        onChange={(variant) => onChange({ ...look, variant })}
      />
      <ChipGroup
        legend="State"
        options={STATE_OPTIONS}
        value={look.stateOverride}
        onChange={(stateOverride) => onChange({ ...look, stateOverride })}
      />
      <div className="field">
        <div className="field-head">
          <label className="field-label" htmlFor={heightId}>
            Height
          </label>
          <output className="value" htmlFor={heightId}>
            {look.height} px
          </output>
        </div>
        <input
          id={heightId}
          type="range"
          className="range"
          min={HEIGHT_RANGE.min}
          max={HEIGHT_RANGE.max}
          value={look.height}
          onChange={(event) => onChange({ ...look, height: Number(event.target.value) })}
        />
      </div>
      <fieldset className="field">
        <legend className="field-label">Colour</legend>
        <div className="swatches">
          {INK_OPTIONS.map((option) => (
            <label key={option.label} className="swatch" title={option.label}>
              <input
                type="radio"
                name={inkName}
                className="visually-hidden"
                checked={option.value === look.ink}
                onChange={() => onChange({ ...look, ink: option.value })}
              />
              <span className="swatch-dot" style={option.value === null ? undefined : { background: option.value }} />
              <span className="visually-hidden">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
