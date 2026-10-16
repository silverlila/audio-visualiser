import { createMicrophone, createVisualiser, microphoneVisualState } from "@silverlila/audio-visualiser";
import "./themedStates.css";

export function mount(root: HTMLElement): () => void {
  const pillCanvas = document.createElement("canvas");
  pillCanvas.className = "themed";
  pillCanvas.style.cssText = "width: 72px; height: 24px";
  const timelineCanvas = document.createElement("canvas");
  timelineCanvas.className = "themed";
  timelineCanvas.style.cssText = "display: block; width: 100%; height: 48px";
  const button = document.createElement("button");
  button.type = "button";
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  root.append(pillCanvas, timelineCanvas, button, alert);

  const mic = createMicrophone();
  const pill = createVisualiser(pillCanvas, { variant: "pill" });
  const timeline = createVisualiser(timelineCanvas, { variant: "timeline" });
  let finished = false;

  function render() {
    const snap = mic.getSnapshot();
    const state = finished ? "done" : microphoneVisualState(snap);
    pill.update({ variant: "pill", stream: snap.stream, state });
    timeline.update({ variant: "timeline", stream: snap.stream, state });
    button.textContent = snap.status === "live" ? "Stop" : "Start";
    alert.textContent = snap.error?.message ?? "";
  }

  button.onclick = () => {
    if (mic.getSnapshot().status === "live") {
      finished = true;
      mic.stop();
    } else {
      finished = false;
      void mic.start();
    }
  };
  const unsubscribe = mic.subscribe(render);

  return () => {
    unsubscribe();
    mic.stop();
    pill.destroy();
    timeline.destroy();
    root.replaceChildren();
  };
}
