/**
 * The React binding: a canvas component that creates one visualiser when its canvas mounts and
 * passes prop changes on to it.
 *
 * React attaches a canvas ref before the component's layout effects run, so the ref callback only
 * sees options from an earlier commit. The first render's options seed `optionsRef`, and any later
 * re-attach (StrictMode, a revealed `<Activity>`) is corrected by the update effect in the same
 * commit, before the first frame.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithRef, ReactElement, Ref } from "react";
import { createVisualiser } from "../index";
import type { Visualiser, VisualiserOptions } from "../index";

export type AudioVisualiserProps =
  Omit<ComponentPropsWithRef<"canvas">, "children" | "width" | "height" | "role">
  & Pick<VisualiserOptions, "stream" | "state" | "variant">;

function attachRef<T>(ref: Ref<T> | undefined, value: T): () => void {
  if (typeof ref === "function") {
    const cleanup = ref(value);
    return typeof cleanup === "function" ? cleanup : () => ref(null);
  }
  if (ref === null || ref === undefined) return () => {};
  ref.current = value;
  return () => {
    ref.current = null;
  };
}

/** A canvas that draws `stream`. The core owns its `width`, `height`, `role`, `aria-label` and
 *  `data-state`; it renders again only when its props change, never per animation frame. */
export function AudioVisualiser({
  stream,
  state,
  variant,
  "aria-label": label,
  ref,
  style,
  ...rest
}: AudioVisualiserProps): ReactElement {
  const optionsRef = useRef<VisualiserOptions>({ stream, state, variant, label });
  const visRef = useRef<Visualiser | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const mountVisualiser = useCallback((canvas: HTMLCanvasElement) => {
    const vis = createVisualiser(canvas, optionsRef.current);
    canvasRef.current = canvas;
    visRef.current = vis;
    return () => {
      vis.destroy();
      visRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const options = { stream, state, variant, label };
    optionsRef.current = options;
    visRef.current?.update(options);
  }, [stream, state, variant, label]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    return attachRef(ref, canvas);
  }, [ref]);

  return (
    <canvas
      {...rest}
      ref={mountVisualiser}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}
