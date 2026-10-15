import { useCallback, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithRef, ReactElement, Ref } from "react";
import { createVisualiser } from "../index";
import type { Visualiser, VisualiserOptions } from "../index";

export type AudioVisualiserProps =
  Omit<ComponentPropsWithRef<"canvas">, "children" | "width" | "height" | "role">
  & Pick<VisualiserOptions, "stream" | "state" | "variant">;

/** Points `ref` at `value` and returns the matching detach. */
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
  // React attaches the canvas ref before this component's layout effects run, so the ref
  // callback can only see options from an earlier commit. Seeding with the first render's
  // options makes the first mount exact; the update effect below corrects any later re-attach
  // (StrictMode, a revealed <Activity>) in the same commit, before the first frame is drawn.
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

  // The caller's ref lives in its own effect so that a new ref identity (an inline callback)
  // re-points the ref without destroying the visualiser and its history.
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
