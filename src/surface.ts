import type { VisualState } from "./states";

export interface SurfaceColors {
  readonly ink: string;
  readonly accent: string;
}

export interface Surface {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px, from the ResizeObserver. */
  readonly width: number;
  readonly height: number;
  /** Document visible && canvas intersecting && width * height > 0. */
  readonly active: boolean;
  readonly reducedMotion: boolean;
  /** Live computed style: ink = `color`, accent = `--av-accent` trimmed, or ink when empty. When the
   *  computed `color` is empty (a detached canvas), ink keeps its last value, or `#000` before any.
   *  Reused object. */
  readColors(): SurfaceColors;
  /** If the backing store differs from the observed device-pixel size, resize it;
   *  then scale the transform so drawing is in CSS px, and clear. */
  beginFrame(): void;
  /** Writes role="img", aria-label, data-state — only when they differ from the current values. */
  setAccessibility(state: VisualState, label: string): void;
  clear(): void;
  /** Idempotent. Disconnects observers and listeners, clears, removes role/aria-label/data-state
   *  and restores the inline `contain`. */
  dispose(): void;
}

/** Ink before the canvas has ever computed a colour. */
const FALLBACK_INK = "#000";

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Backing-store pixels for one resize entry. Safari has no devicePixelContentBoxSize. */
function devicePixelSize(entry: ResizeObserverEntry, cssBox: ResizeObserverSize): Size {
  if ("devicePixelContentBoxSize" in entry && entry.devicePixelContentBoxSize.length > 0) {
    const box = entry.devicePixelContentBoxSize[0];
    return { width: box.inlineSize, height: box.blockSize };
  }
  const dpr = window.devicePixelRatio;
  return { width: Math.round(cssBox.inlineSize * dpr), height: Math.round(cssBox.blockSize * dpr) };
}

function setAttributeIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Throws Error("audio-visualiser: canvas has no 2D context") if getContext("2d") is null. */
export function createSurface(canvas: HTMLCanvasElement, onActiveChange: () => void): Surface {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("audio-visualiser: canvas has no 2D context");

  let width = 0;
  let height = 0;
  let backingWidth = 0;
  let backingHeight = 0;
  let intersecting = false;
  let active = false;
  let disposed = false;
  const colors = { ink: FALLBACK_INK, accent: FALLBACK_INK };
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Size containment stops a canvas without CSS size from growing each time its
  // backing store is resized: it falls back to the default object size instead.
  const previousContain = canvas.style.contain;
  canvas.style.contain = "size";

  function refreshActive(): void {
    const next = document.visibilityState === "visible" && intersecting && width * height > 0;
    if (next === active) return;
    active = next;
    onActiveChange();
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    const cssBox = entry.contentBoxSize[0];
    width = cssBox.inlineSize;
    height = cssBox.blockSize;
    const backing = devicePixelSize(entry, cssBox);
    backingWidth = backing.width;
    backingHeight = backing.height;
    refreshActive();
  });
  try {
    resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    // Safari rejects the device-pixel box; devicePixelSize() then derives it from devicePixelRatio.
    resizeObserver.observe(canvas, { box: "content-box" });
  }

  const intersectionObserver = new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1].isIntersecting;
    refreshActive();
  });
  intersectionObserver.observe(canvas);

  document.addEventListener("visibilitychange", refreshActive);

  const clear = (): void => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  return {
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get active() {
      return active;
    },
    get reducedMotion() {
      return motionQuery.matches;
    },
    readColors() {
      const style = getComputedStyle(canvas);
      // A detached canvas computes `color` as "", which canvas gradients reject.
      if (style.color !== "") colors.ink = style.color;
      colors.accent = style.getPropertyValue("--av-accent").trim() || colors.ink;
      return colors;
    },
    beginFrame() {
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      ctx.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
    },
    setAccessibility(state, label) {
      setAttributeIfChanged(canvas, "role", "img");
      setAttributeIfChanged(canvas, "aria-label", label);
      setAttributeIfChanged(canvas, "data-state", state);
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", refreshActive);
      clear();
      canvas.removeAttribute("role");
      canvas.removeAttribute("aria-label");
      canvas.removeAttribute("data-state");
      canvas.style.contain = previousContain;
    },
  };
}
