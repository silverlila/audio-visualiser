# Field guide

Facts about this repo that cost an agent time to discover. Read by every
implementer before it starts. Budget: 40 lines — to add one, delete a
line worth less. Coding standards belong in a skill, not here.

- tsconfigs do not set `noUncheckedIndexedAccess`: an out-of-range read on an `ArrayLike<number>` is typed `number`, so `x[i] ?? 0` never fires and `undefined`/NaN reaches the maths silently — check `.length` explicitly (see `measureBands` in `src/signal.ts`, `display.step` in `src/display.ts`).
- `tsconfig.lib.json` has `types: []` (no Node types), so `process` does not type-check in `src/*.test.ts`; to assert "no unhandled rejection", rely on `vitest run`, which reports "Unhandled Rejection" and fails the run.
- `vitest.config.ts` only collects `*.test.ts`, so a `*.test.tsx` is silently never run: React render tests use `createElement` in a `.test.ts` with `// @vitest-environment jsdom`. jsdom needs AudioContext, ResizeObserver, IntersectionObserver, matchMedia and the 2D context faked (see `src/visualiser.test.ts`).
- `vitest run` hides `console.log` from passing tests here; add `--silent=false --reporter=verbose` while debugging.
