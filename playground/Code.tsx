/**
 * Code display for the playground: syntax-highlighted blocks, tabs between files, and a copy
 * button.
 *
 * Clipboard writes fail on insecure origins (no `navigator.clipboard`) and when permission is
 * denied (the promise rejects); the UI reports both.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { highlight } from "./highlight";
import type { Language } from "./highlight";

export interface CodeFile {
  readonly label: string;
  readonly language: Language;
  readonly code: string;
}

type CopyStatus = "idle" | "copied" | "failed";

const COPY_TEXT: Record<CopyStatus, string> = { idle: "Copy", copied: "Copied", failed: "Copy failed" };

const COPY_ANNOUNCEMENT: Record<CopyStatus, string> = {
  idle: "",
  copied: "Copied to the clipboard",
  failed: "Could not copy. Select the code and copy it by hand.",
};

const COPY_RESET_MS = 1500;

function CopyIcon(props: { readonly status: CopyStatus }): ReactElement {
  return (
    <svg className="copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {props.status === "copied" ? (
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export function CopyButton(props: { readonly text: string; readonly label: string }): ReactElement {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const id = window.setTimeout(() => setStatus("idle"), COPY_RESET_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(props.text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      <button type="button" className="copy-button" onClick={() => void copy()}>
        <CopyIcon status={status} />
        {COPY_TEXT[status]}
        <span className="visually-hidden"> {props.label}</span>
      </button>
      <span className="visually-hidden" role="status">
        {COPY_ANNOUNCEMENT[status]}
      </span>
    </>
  );
}

export function CodeBlock(props: { readonly code: string; readonly language: Language }): ReactElement {
  return (
    <pre className="code">
      <code>
        {highlight(props.code, props.language).map((token, index) => (
          <span key={index} className={token.kind === "plain" ? undefined : `tok-${token.kind}`}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

function nextTab(key: string, active: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (active + 1) % count;
    case "ArrowLeft":
      return (active - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function CodeTabs(props: {
  readonly files: readonly [CodeFile, ...CodeFile[]];
  readonly label: string;
  readonly what: string;
}): ReactElement {
  const { files } = props;
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const shown = files[active];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = nextTab(event.key, active, files.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="code-tabs">
      <div className="code-tabs-head">
        <div role="tablist" aria-label={props.label} className="tabs" onKeyDown={onKeyDown}>
          {files.map((file, index) => (
            <button
              key={file.label}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              className="tab"
              aria-selected={index === active}
              aria-controls={`${id}-panel-${index}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
            >
              {file.label}
            </button>
          ))}
        </div>
        <CopyButton key={active} text={shown.code} label={`${shown.label} ${props.what}`} />
      </div>
      {files.map((file, index) => (
        <div
          key={file.label}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          className="code-scroll"
          hidden={index !== active}
          tabIndex={0}
        >
          <CodeBlock code={file.code} language={file.language} />
        </div>
      ))}
    </div>
  );
}
