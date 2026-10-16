import type { ReactElement } from "react";
import { CodeBlock, CodeTabs, CopyButton } from "./Code";
import type { CodeFile } from "./Code";

const INSTALL: readonly [CodeFile, ...CodeFile[]] = [
  { label: "npm", language: "sh", code: "npm install @silverlila/audio-visualiser" },
  { label: "pnpm", language: "sh", code: "pnpm add @silverlila/audio-visualiser" },
  { label: "yarn", language: "sh", code: "yarn add @silverlila/audio-visualiser" },
  { label: "bun", language: "sh", code: "bun add @silverlila/audio-visualiser" },
];

const IMPORTS = `// Core, for any framework, no dependencies
import { createMicrophone, createVisualiser } from "@silverlila/audio-visualiser";

// React 19: a component and a hook
import { AudioVisualiser, useMicrophone } from "@silverlila/audio-visualiser/react";`;

export function Hero(): ReactElement {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-copy">
        <h1 id="hero-heading" className="hero-title">
          The recording indicator for apps that listen.
        </h1>
        <p className="hero-lead">
          audio-visualiser draws live microphone audio as a small canvas visual that knows what your app is doing: idle,
          connecting, recording, processing, done or error. Six looks, a framework-free core, and a React component with a
          microphone hook.
        </p>
      </div>

      <div className="hero-code">
        <div className="field">
          <h2 className="field-label">Install</h2>
          <CodeTabs files={INSTALL} label="Package manager" what="command" />
          <p className="hint">
            Not on npm yet. Until it is, run <code>pnpm pack</code> in this repository and install the .tgz, as the README
            explains.
          </p>
        </div>
        <div className="field">
          <div className="hero-code-head">
            <h2 className="field-label">Import</h2>
            <CopyButton text={IMPORTS} label="import lines" />
          </div>
          <div className="code-tabs">
            <div className="code-scroll" role="region" aria-label="Import lines" tabIndex={0}>
              <CodeBlock code={IMPORTS} language="ts" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
