# 07 — The other five variants: `pill`, `spectrum`, `line`, `orb`, `radial`

> Part of `00-context.md`. **Read that first** — this file assumes its background, decisions and
> out-of-scope list and does not repeat them.

- **Satisfies**: AC10
- **You will see**: changing `variant="timeline"` in `playground/App.tsx` to any of `pill`,
  `spectrum`, `line`, `orb` or `radial` draws that look, live from your voice, with idle breathing
  and a processing shimmer.
- **Skills**: `animations`, `design-foundations`
- **Checkpoint**: `pnpm dev`, then switch the variant in `playground/App.tsx` (or in the unit 08
  picker if you review later). Does each variant read clearly at 64 px tall and at 24×64 px, in
  light and dark, in every state?

## Goal

Add the remaining five renderers against the `Frame` contract from unit 05. Each is one file with a
stateless `draw`. All motion comes from `frame.level`, `frame.bands`, `frame.waveform`,
`frame.mix` and `frame.ambientMs`. No variant keeps its own timers or state, and none uses a
per-state `switch`. Blending goes through `frame.mix` (`signal`, `breathe`, `shimmer`, `rest`).

## Files

- `src/variants/pill.ts` (new)
- `src/variants/spectrum.ts` (new)
- `src/variants/line.ts` (new)
- `src/variants/orb.ts` (new)
- `src/variants/radial.ts` (new)
- `src/variants/draw.ts`: add shared helpers as needed (e.g. `polarBar`).
- `src/variants/index.ts`: `VARIANTS = ["timeline", "pill", "spectrum", "line", "orb", "radial"] as const`, plus their `RENDERERS` entries.
- `src/index.test.ts` (new)

## Changes

### 1. Variant briefs

The numbers below are the starting design. Tune them by eye at the checkpoint.

| Variant | `bands` | Drawing |
|---|---|---|
| `pill` | 5 | Compact Superwhisper mini-view. A status dot (diameter `0.28·h`) at the left, filled with `accent`, and five rounded bars to its right. Bar width `0.12·h`, gap `0.08·h`, centred vertically. Bar height is `max(w, bands[i]·h·0.9·signal)`. The order is centre-out (bands 0,1,2 → bars 2,1,3,0,4), so the middle bar carries the low frequencies. `breathe` adds a sine wave across the bars. `shimmer` pulses the dot's alpha. `rest` settles the bars to dots. |
| `spectrum` | 32 | Mirrored bars across the full width: low frequencies at the centre, rising frequencies outward to both edges. Each bar grows up and down from the horizontal midline. Bar width is `width / 64` minus a 1 px gap, with rounded caps. Alpha follows `shimmer`. |
| `line` | 0 | Oscilloscope. A smooth path through `width / 3` points sampled from `waveform`, scaled by `0.45·h·signal` and drawn with quadratic midpoints. `lineWidth = 2`, `lineCap = "round"`, stroke `ink`. `breathe` replaces it with a slow sine of amplitude `0.08·h`. `shimmer` sweeps a gradient along the stroke. |
| `orb` | 8 | A filled circle at the centre. Base radius `0.32·min(w,h)`, which grows by up to 35% with `level·signal`. The edge wobbles: radius per angle is interpolated around the 8 bands as a closed smooth curve, with amplitude `0.08·min(w,h)·signal`. `breathe` scales it by `1 + 0.04·sin(ambientMs/700)`. `shimmer` draws a rotating `accent` arc (90°, one turn per 1600 ms) just outside the edge. |
| `radial` | 48 | 48 bars around a circle. Inner radius `0.30·min(w,h)`, bar length `0.04·min + bands[i]·0.16·min·signal`, rounded caps, `lineWidth` from the circumference. The bands run around the full circle, mirrored so the ends meet smoothly. `shimmer` rotates a brightness wave around the circle. |

Rules for all variants:
- Draw in CSS px. The context is already DPR-scaled and cleared.
- Use `frame.ink` and `frame.accent`. No hard-coded colours.
- Allocate nothing per frame: no array literals, closures or gradients built inside loops. One
  gradient per frame is acceptable.
- At `rest = 1` every variant shows a calm static shape, never an empty canvas.

### 2. `src/index.test.ts` (AC10)

- `core entry imports in Node and exports the public surface`: dynamic `import("./index")`.
  Assert:
  - `VARIANTS` deep-equals `["timeline","pill","spectrum","line","orb","radial"]`
  - `VISUAL_STATES` has the six states
  - `createVisualiser`, `createMicrophone` and `microphoneVisualState` are functions
- `every variant declares a non-negative integer band count`: import `RENDERERS` from
  `./variants`. For every name in `VARIANTS`, `Number.isInteger(RENDERERS[name].bands)` and
  `>= 0`.

## Verify

```sh
pnpm typecheck && pnpm lint && pnpm test
```

## Watch out

- `spectrum` and `radial` read `bands` up to index `bands - 1`. The visualiser sizes
  `frame.bands` from `RENDERERS[variant].bands`, so never index past it.
- Under reduced motion `ambientMs` is frozen. Variants must still look right with a constant
  `ambientMs`, with no division by its derivative.
