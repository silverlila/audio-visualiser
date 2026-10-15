import { describe, it, expect } from "vitest";
import { RENDERERS } from "./variants";

describe("core entry", () => {
  it("core entry imports in Node and exports the public surface", async () => {
    const core = await import("./index");

    expect(core.VARIANTS).toEqual(["timeline", "pill", "spectrum", "line", "orb", "radial"]);
    expect(core.VISUAL_STATES).toEqual(["idle", "connecting", "recording", "processing", "done", "error"]);
    expect(typeof core.createVisualiser).toBe("function");
    expect(typeof core.createMicrophone).toBe("function");
    expect(typeof core.microphoneVisualState).toBe("function");
  });

  it("every variant declares a non-negative integer band count", async () => {
    const { VARIANTS } = await import("./index");

    for (const name of VARIANTS) {
      expect(Number.isInteger(RENDERERS[name].bands), name).toBe(true);
      expect(RENDERERS[name].bands, name).toBeGreaterThanOrEqual(0);
    }
  });
});
