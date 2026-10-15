# 02 — Move the app into `playground/`, split tsconfigs, fix speech-to-text

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC2, AC5
- **You will see**: `pnpm dev` still opens the old demo, now served from `playground/`. Its
  transcript keeps accumulating across sentences instead of showing only the last one, and
  `pnpm lint` is warning-free.

## Goal

Split the repo into the library (`src/`) and the dev app (`playground/`). Give each its own
tsconfig, and let the playground import the package by name. Move speech-to-text into the playground
and fix bug 7. The old visualiser hook moves along with it **temporarily**, so the demo keeps
working. Unit 05 deletes it.

## Files

- `index.html` → `playground/index.html`. Change the script `src` to `/main.tsx`, remove the `vite.svg` favicon link, and set the title to `audio-visualiser playground`.
- `src/main.tsx` → `playground/main.tsx`. Its imports become `./index.css` and `./App` (extensionless).
- `src/App.tsx` → `playground/App.tsx`. Imports become `./useSpeechToText` and `./useAudioVisualiser`. Remove `console.log("re-rendering")`. Show `transcript` and `interimTranscript` always, not only while listening.
- `src/index.css` → `playground/index.css`. Content unchanged.
- `src/useAudioVisualiser.tsx` → `playground/useAudioVisualiser.ts`. A temporary move with the content unchanged, including its `eslint-disable` line. It has no JSX, so `.ts` is correct. Unit 05 deletes it.
- `src/useSpeechToText.tsx` → `playground/useSpeechToText.ts`, rewritten (change 3).
- `playground/speech.ts` (new): pure transcript helpers.
- `playground/speech.test.ts` (new)
- Delete `src/App.css`, `src/assets/react.svg`, `public/vite.svg` (and the empty `src/assets/`, `public/` directories).
- `src/index.ts` (new): the core entry. For now it only re-exports units 01's modules (change 4).
- `tsconfig.app.json` → rename to `tsconfig.playground.json`, then edit it (change 2).
- `tsconfig.lib.json` (new)
- `tsconfig.json`: update the references.
- `vite.config.ts`: set root and aliases.
- `package.json`: change `lint` to `eslint . --max-warnings 0`.

Use `git mv` for moves so history follows the files.

## Changes

### 1. `vite.config.ts`

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: "playground",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^audio-visualiser\/react$/, replacement: fromRoot("./src/react/index.ts") },
      { find: /^audio-visualiser$/, replacement: fromRoot("./src/index.ts") },
    ],
  },
});
```

`src/react/index.ts` does not exist until unit 06. An alias to a missing file is harmless until something imports it.

### 2. Tsconfig split

- `tsconfig.lib.json`: copy the old `tsconfig.app.json`, then change three things:
  - `"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.lib.tsbuildinfo"`
  - `"types": []`, so no `vite/client` or `dom-speech-recognition` ambient types leak into the library
  - `"include": ["src"]`

  Keep `lib: ["ES2022", "DOM", "DOM.Iterable"]` and `jsx: "react-jsx"`.
- `tsconfig.playground.json` (the renamed `tsconfig.app.json`): change four things:
  - `tsBuildInfoFile` becomes `tsconfig.playground.tsbuildinfo`
  - keep `"types": ["vite/client", "dom-speech-recognition"]`
  - `"include": ["playground"]`
  - add
    ```json
    "paths": {
      "audio-visualiser": ["./src/index.ts"],
      "audio-visualiser/react": ["./src/react/index.ts"]
    }
    ```
- `tsconfig.json` `references`: `./tsconfig.lib.json`, `./tsconfig.playground.json`, `./tsconfig.node.json`.

### 3. Speech-to-text fixed (bug 7)

`playground/speech.ts`, pure and tested:

```ts
/** Final and interim text from one SpeechRecognition result event, from resultIndex on. */
export function readResults(
  results: ArrayLike<{ readonly isFinal: boolean; readonly 0: { readonly transcript: string } }>,
  resultIndex: number,
): { final: string; interim: string };
/** Appends a final chunk with exactly one space between chunks; trims chunk edges; empty chunk returns previous. */
export function appendFinal(previous: string, chunk: string): string;
```

`playground/useSpeechToText.ts`:
- Same public shape as the old hook (`isSupported`, `transcript`, `interimTranscript`, `isListening`, `error`, `start`, `stop`, `discard`).
- `onresult` calls `readResults`, then `setTranscript((prev) => appendFinal(prev, final))`. The functional update removes the stale `transcript` closure.
- `onFinalTranscript` / `onInterimTranscript` are wrapped with React 19.2's `useEffectEvent` (exported from `react`; types present in `@types/react` 19.2.7), so the effect always calls the latest props. `onFinalTranscript` receives the new chunk. The effect's dependency array stays `[]`, and lint must be clean.
- `recognition.lang = navigator.language || "en-US"`, which resolves the old TODO.
- `start()` is a no-op while already listening (track it in a ref). `SpeechRecognition.start()` throws `InvalidStateError` otherwise.
- `start()` clears `error`.
- `discard()` clears both `transcript` and `interimTranscript`.

`playground/speech.test.ts`, names verbatim (AC5):
- `appendFinal accumulates text across results`: `appendFinal(appendFinal("", "hello"), " world ")` is `"hello world"`.
- `readResults separates final from interim from resultIndex on`

### 4. `src/index.ts`

```ts
export * from "./signal";
export * from "./history";
```

This is temporary. Unit 05 replaces it with the real public surface. It exists now so `tsconfig.lib.json` has an entry and the `audio-visualiser` alias resolves.

## Verify

```sh
pnpm typecheck && pnpm lint && pnpm test
```

Then `pnpm dev` should serve `http://localhost:5173/` with the old demo working.

## Watch out

- `eslint.config.js` lints every `**/*.{ts,tsx}`, which now includes `playground/`. The temporary
  `playground/useAudioVisualiser.ts` keeps its `eslint-disable` line, so it stays lint-clean. Do
  not try to fix it here.
- With `root: "playground"`, Vite serves `playground/index.html`. A root-level `index.html` left
  behind would be ignored but confusing, so make sure it is moved, not copied.
- The `paths` mapping means `tsc -b` type-checks some `src/` files through the playground project
  as well. That is expected.
