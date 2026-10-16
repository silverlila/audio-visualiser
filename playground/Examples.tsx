import type { ComponentType, ReactElement } from "react";
import { CodeTabs } from "./Code";
import type { CodeFile } from "./Code";
import AssistantOrb from "./examples/AssistantOrb";
import assistantOrbReact from "./examples/AssistantOrb.tsx?raw";
import assistantOrbVanilla from "./examples/assistantOrb.vanilla.ts?raw";
import DictationButton from "./examples/DictationButton";
import dictationButtonReact from "./examples/DictationButton.tsx?raw";
import dictationButtonCss from "./examples/dictationButton.css?raw";
import dictationButtonVanilla from "./examples/dictationButton.vanilla.ts?raw";
import Equaliser from "./examples/Equaliser";
import equaliserReact from "./examples/Equaliser.tsx?raw";
import equaliserVanilla from "./examples/equaliser.vanilla.ts?raw";
import ThemedStates from "./examples/ThemedStates";
import themedStatesReact from "./examples/ThemedStates.tsx?raw";
import themedStatesCss from "./examples/themedStates.css?raw";
import themedStatesVanilla from "./examples/themedStates.vanilla.ts?raw";
import VoiceNote from "./examples/VoiceNote";
import voiceNoteReact from "./examples/VoiceNote.tsx?raw";
import voiceNoteVanilla from "./examples/voiceNote.vanilla.ts?raw";

interface Example {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly Preview: ComponentType;
  readonly files: readonly [CodeFile, ...CodeFile[]];
}

function sources(react: string, vanilla: string, css?: string): readonly [CodeFile, ...CodeFile[]] {
  const files: [CodeFile, ...CodeFile[]] = [
    { label: "React", language: "tsx", code: react.trimEnd() },
    { label: "Vanilla", language: "ts", code: vanilla.trimEnd() },
  ];
  if (css !== undefined) files.push({ label: "CSS", language: "css", code: css.trimEnd() });
  return files;
}

const EXAMPLES: readonly Example[] = [
  {
    id: "dictation-button",
    title: "Dictation button",
    description: "A compact pill inside the button. The dot turns red while it records.",
    Preview: DictationButton,
    files: sources(dictationButtonReact, dictationButtonVanilla, dictationButtonCss),
  },
  {
    id: "voice-note",
    title: "Voice note recorder",
    description: "A scrolling timeline while you record, settling to done when the note is ready to play back.",
    Preview: VoiceNote,
    files: sources(voiceNoteReact, voiceNoteVanilla),
  },
  {
    id: "assistant-orb",
    title: "Assistant orb",
    description: "Swells while you talk. After Send it shows processing until the answer arrives, then done.",
    Preview: AssistantOrb,
    files: sources(assistantOrbReact, assistantOrbVanilla),
  },
  {
    id: "equaliser",
    title: "Equaliser",
    description: "Frequency bars mirrored around the middle, the smallest complete use of the hook.",
    Preview: Equaliser,
    files: sources(equaliserReact, equaliserVanilla),
  },
  {
    id: "themed-states",
    title: "Theming per state",
    description: "The canvas carries data-state, so plain CSS sets the ink and the accent for each state.",
    Preview: ThemedStates,
    files: sources(themedStatesReact, themedStatesVanilla, themedStatesCss),
  },
];

function ExampleCard(props: { readonly example: Example }): ReactElement {
  const { id, title, description, Preview, files } = props.example;
  const headingId = `example-${id}`;
  return (
    <article className="card example" aria-labelledby={headingId}>
      <div className="example-head">
        <h3 id={headingId} className="section-title">
          {title}
        </h3>
        <p className="hint">{description}</p>
      </div>
      <div className="example-body">
        <div className="example-stage">
          <Preview />
        </div>
        <CodeTabs files={files} label={`${title} code`} what="code" />
      </div>
    </article>
  );
}

export function Examples(): ReactElement {
  return (
    <div className="examples">
      {EXAMPLES.map((example) => (
        <ExampleCard key={example.id} example={example} />
      ))}
    </div>
  );
}
