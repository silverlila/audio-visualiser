# Field guide

Facts about this repo that cost an agent time to discover. Read by every
implementer before it starts. Budget: 40 lines — to add one, delete a
line worth less. Coding standards belong in a skill, not here.

- tsconfigs do not set `noUncheckedIndexedAccess`: an out-of-range read on an `ArrayLike<number>` is typed `number`, so `x[i] ?? 0` never fires and `undefined`/NaN reaches the maths silently — check `.length` explicitly (see `measureBands` in `src/signal.ts`, `display.step` in `src/display.ts`).
