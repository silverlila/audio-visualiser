import { createMicrophone, createVisualiser, microphoneVisualState } from "@silver/audio-visualiser";

export function mount(root: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display: block; width: 100%; height: 120px";
  const button = document.createElement("button");
  button.type = "button";
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  root.append(canvas, button, alert);

  const mic = createMicrophone();
  const vis = createVisualiser(canvas, { variant: "spectrum" });
  const unsubscribe = mic.subscribe((snap) => {
    vis.update({ variant: "spectrum", stream: snap.stream, state: microphoneVisualState(snap) });
    button.textContent = snap.status === "live" ? "Stop microphone" : "Start microphone";
    alert.textContent = snap.error?.message ?? "";
  });
  button.onclick = () => (mic.getSnapshot().status === "live" ? mic.stop() : void mic.start());

  return () => {
    unsubscribe();
    mic.stop();
    vis.destroy();
    root.replaceChildren();
  };
}
