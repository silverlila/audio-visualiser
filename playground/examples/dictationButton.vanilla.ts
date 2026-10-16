import { createMicrophone, createVisualiser, microphoneVisualState } from "@silver/audio-visualiser";
import "./dictationButton.css";

export function mount(root: HTMLElement): () => void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dictation-button";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width: 56px; height: 20px";
  canvas.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  button.append(canvas, label);
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  root.append(button, alert);

  const mic = createMicrophone();
  const vis = createVisualiser(canvas, { variant: "pill" });
  const unsubscribe = mic.subscribe((snap) => {
    vis.update({ variant: "pill", stream: snap.stream, state: microphoneVisualState(snap) });
    label.textContent = snap.status === "live" ? "Stop dictation" : "Dictate";
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
