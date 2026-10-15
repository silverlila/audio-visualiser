// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSurface } from "./surface";

class FakeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

/** What the browser's computed style reports. A detached canvas reports `color: ""` in browsers,
 *  which jsdom does not reproduce, so the computed style is faked. */
let computed: { color: string; accent: string };

beforeEach(() => {
  computed = { color: "", accent: "" };
  vi.stubGlobal("ResizeObserver", FakeObserver);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("getComputedStyle", () => ({
    color: computed.color,
    getPropertyValue: (name: string) => (name === "--av-accent" ? computed.accent : ""),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function surface() {
  return createSurface(document.createElement("canvas"), () => {});
}

describe("readColors", () => {
  it("falls back to black when the canvas has never had a computed colour", () => {
    expect(surface().readColors()).toEqual({ ink: "#000", accent: "#000" });
  });

  it("keeps the last computed colour when the canvas is detached", () => {
    const subject = surface();
    computed = { color: "rgb(255, 0, 0)", accent: "" };
    subject.readColors();

    computed = { color: "", accent: "" };

    expect(subject.readColors()).toEqual({ ink: "rgb(255, 0, 0)", accent: "rgb(255, 0, 0)" });
  });

  it("uses --av-accent, trimmed, when it is set", () => {
    computed = { color: "rgb(255, 0, 0)", accent: " rgb(0, 0, 255) " };

    expect(surface().readColors()).toEqual({ ink: "rgb(255, 0, 0)", accent: "rgb(0, 0, 255)" });
  });
});
