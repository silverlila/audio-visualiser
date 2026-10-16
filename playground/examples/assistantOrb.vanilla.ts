import { createMicrophone, createVisualiser, microphoneVisualState } from "@silver/audio-visualiser";

const askAssistant = () => new Promise<void>((resolve) => setTimeout(resolve, 1500));

export function mount(root: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width: 160px; height: 160px";
  const button = document.createElement("button");
  button.type = "button";
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  root.append(canvas, button, alert);

  const mic = createMicrophone();
  const vis = createVisualiser(canvas, { variant: "orb" });
  let reply: "processing" | "done" | null = null;
  let mounted = true;

  function render() {
    const snap = mic.getSnapshot();
    vis.update({ variant: "orb", stream: snap.stream, state: reply ?? microphoneVisualState(snap) });
    button.textContent = snap.status === "live" ? "Send" : "Talk";
    alert.textContent = snap.error?.message ?? "";
  }

  button.onclick = async () => {
    if (mic.getSnapshot().status !== "live") {
      reply = null;
      void mic.start();
      return;
    }
    reply = "processing";
    mic.stop();
    await askAssistant();
    if (!mounted || reply !== "processing") return;
    reply = "done";
    render();
  };
  const unsubscribe = mic.subscribe(render);

  return () => {
    mounted = false;
    unsubscribe();
    mic.stop();
    vis.destroy();
    root.replaceChildren();
  };
}
