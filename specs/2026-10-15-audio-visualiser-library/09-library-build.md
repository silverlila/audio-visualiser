# 09 — Library build, package exports, README

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC1, AC3, AC12
- **You will see**: `pnpm build` writes `dist/index.js`, `dist/react.js` and their `.d.ts` files.
  `package.json` is set up as a library with `.` and `./react` exports, and the README documents
  the API.

## Goal

Make the package buildable as a library. Its Verify runs the full Verification block from
`00-context.md`, so this unit is also where AC1 (typecheck) and AC3 (full test suite) are checked
for the finished effort.

## Files

- `vite.lib.config.ts` (new)
- `tsconfig.build.json` (new): declaration emit.
- `tsconfig.node.json`: add `vite.lib.config.ts` to `include`.
- `package.json`: exports, peers, scripts.
- `README.md`: rewritten.
- `.gitignore`: already ignores `dist`. Confirm it, no change expected.

## Changes

### 1. `vite.lib.config.ts`

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: { index: fromRoot("./src/index.ts"), react: fromRoot("./src/react/index.ts") },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: { entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js" },
    },
  },
});
```

`src/react/index.ts` imports the core only through `"../index"` (unit 06), so Rollup emits
`react.js` importing `./index.js` or a shared chunk. It never inlines a second copy of the core,
which would duplicate the shared AudioContext module state.

### 2. `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.lib.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.build.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

This emits `dist/index.d.ts` and `dist/react/index.d.ts`, plus one `.d.ts` per module.

### 3. `package.json`

- Keep `"name": "audio-visualiser"` and `"private": true` (publishing is out of scope). Set
  `"version": "0.1.0"`.
- Add:
  ```json
  "files": ["dist"],
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react.js" },
    "./package.json": "./package.json"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "peerDependenciesMeta": { "react": { "optional": true } }
  ```
- Move `react` and `react-dom` from `dependencies` to `devDependencies`, keeping their versions,
  and remove the empty `dependencies` key.
- Scripts:
  - `"dev": "vite"`
  - `"build": "vite build -c vite.lib.config.ts && tsc -p tsconfig.build.json"`
  - `"build:playground": "vite build --outDir ../dist-playground --emptyOutDir"`
  - `"preview": "vite preview --outDir ../dist-playground"`
  - `"typecheck"`, `"lint"` and `"test"` stay as they are
- Add `dist-playground` to `.gitignore`.

### 4. `README.md`

Replace the Vite template. Sections:
1. What it is: one paragraph, with the Superwhisper inspiration.
2. Install.
3. React quickstart, using the dictation-button example from `specs/design/2026-10-15-audio-visualiser-library.md` § Usage.
4. Vanilla quickstart (`createMicrophone` + `createVisualiser`).
5. Options table: `stream`, `state`, `variant`, `label`.
6. Variants, one line each.
7. States, plus how to theme them (`color`, `--av-accent`, `[data-state=…]`).
8. Sizing: the canvas is sized by CSS, and the core handles DPR and resize.
9. Microphone API: snapshot fields, error kinds, `start` never rejects.
10. Writing an adapter for another framework: the three-call lifecycle, with the Svelte action one-liner.
11. Development: `pnpm dev`, `pnpm test`, `pnpm build`.

## Verify

The full Verification block from `00-context.md`:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && test -f dist/index.js && test -f dist/react.js && test -f dist/index.d.ts && test -f dist/react/index.d.ts && ! grep -q getUserMedia dist/react.js && grep -qE 'from ?"react' dist/react.js && ! grep -rnE "eslint-disable|as any|: any\b" src playground && test ! -e playground/useAudioVisualiser.ts && test ! -e src/useAudioVisualiser.tsx
```

## Watch out

- `tsconfig.lib.json` has `allowImportingTsExtensions`. That is allowed together with
  `emitDeclarationOnly`, but `src/` must use extensionless imports (see `00-context.md`
  conventions). Check with `grep -rn "from \"\./.*\.tsx\?\"" src`, which should match nothing.
- `vite.lib.config.ts` must not inherit `root: "playground"` from `vite.config.ts`. Passing `-c`
  replaces the config, it doesn't merge, so this is fine as long as the lib config does not import
  the dev config.
- If Rollup names the shared chunk differently, the AC still holds as long as `dist/react.js`
  contains no `getUserMedia` (which only `microphone.ts` contains).
