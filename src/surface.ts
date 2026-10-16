/**
 * The canvas a visualiser draws on: its CSS and backing-store sizes, whether it is visible, the
 * colours it takes from CSS, and its accessibility attributes.
 *
 * A detached canvas computes `color` as "", and canvas gradients reject that, so ink keeps its
 * last good value. Safari lacks `devicePixelContentBoxSize` and rejects the
 * `device-pixel-content-box` observe option, so the backing size falls back to the content box ×
 * devicePixelRatio. A canvas with no CSS size grows each time its backing store is resized;
 * `contain: size` makes it fall back to the default object size instead.
 */
import type { VisualState } from "./states";

export interface SurfaceColors {
  readonly ink: string;
  readonly accent: string;
}

export interface Surface {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readColors(): SurfaceColors;
  beginFrame(): void;
  setAccessibility(state: VisualState, label: string): void;
  clear(): void;
  dispose(): void;
}

const FALLBACK_INK = "#000";

interface Size {
  readonly width: number;
  readonly height: number;
}

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
