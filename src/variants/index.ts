import type { Variant } from "./frame";
import { timeline } from "./timeline";

export const VARIANTS = ["timeline"] as const;
export type VariantName = (typeof VARIANTS)[number];

export const RENDERERS = { timeline } satisfies Record<VariantName, Variant>;
