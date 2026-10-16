import { describe, it, expect } from "vitest";

describe("audio-visualiser/react", () => {
  it("react entry exports the component, the hook and the core", async () => {
    const entry = await import("../../src/react/index");

    expect(typeof entry.AudioVisualiser).toBe("function");
    expect(typeof entry.useMicrophone).toBe("function");
    expect(typeof entry.createVisualiser).toBe("function");
    expect(entry.VARIANTS).toContain("timeline");
  });
});
