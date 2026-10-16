import { createMicrophone, createVisualiser, microphoneVisualState } from "@silverlila/audio-visualiser";

export function mount(root: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display: block; width: 100%; height: 64px";
  const button = document.createElement("button");
  button.type = "button";
  const audio = document.createElement("audio");
  audio.controls = true;
  const alert = document.createElement("p");
  alert.setAttribute("role", "alert");
  root.append(canvas, button, audio, alert);

  const mic = createMicrophone();
  const vis = createVisualiser(canvas, { variant: "timeline" });
  let recorder: MediaRecorder | null = null;
  let note: string | null = null;

  function render() {
    const snap = mic.getSnapshot();
    vis.update({ variant: "timeline", stream: snap.stream, state: note ? "done" : microphoneVisualState(snap) });
    button.textContent = snap.status === "live" ? "Stop" : "Record";
    button.disabled = snap.status === "requesting";
    audio.hidden = !note;
    alert.textContent = snap.error?.message ?? "";
  }

  function showNote(url: string | null) {
    if (note) URL.revokeObjectURL(note);
    note = url;
    if (url) audio.src = url;
    render();
  }

  async function record() {
    showNote(null);
    const { stream } = await mic.start();
    if (!stream) return;
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => showNote(URL.createObjectURL(new Blob(chunks)));
    recorder.start();
  }

  button.onclick = () => {
    if (mic.getSnapshot().status !== "live") return void record();
    recorder?.stop();
    mic.stop();
  };
  const unsubscribe = mic.subscribe(render);

  return () => {
    unsubscribe();
    if (recorder) recorder.onstop = null;
    mic.stop();
    vis.destroy();
    if (note) URL.revokeObjectURL(note);
    root.replaceChildren();
  };
}
