import type { Variant } from "./frame";
import { line } from "./line";
import { orb } from "./orb";
import { pill } from "./pill";
import { radial } from "./radial";
import { spectrum } from "./spectrum";
import { timeline } from "./timeline";

export const VARIANTS = ["timeline", "pill", "spectrum", "line", "orb", "radial"] as const;
export type VariantName = (typeof VARIANTS)[number];

export const RENDERERS = { timeline, pill, spectrum, line, orb, radial } satisfies Record<VariantName, Variant>;
