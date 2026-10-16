import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createMicrophone } from "../index";
import type { Microphone, MicrophoneOptions, MicrophoneSnapshot } from "../index";

export type UseMicrophoneResult = MicrophoneSnapshot & Pick<Microphone, "start" | "stop">;

/** Owns one Microphone for the component's lifetime. `options` is read once, at mount. Stops on unmount. */
export function useMicrophone(options?: MicrophoneOptions): UseMicrophoneResult {
  const [mic] = useState(() => createMicrophone(options));
  const snapshot = useSyncExternalStore(mic.subscribe, mic.getSnapshot, mic.getSnapshot);

  useEffect(() => () => mic.stop(), [mic]);

  return useMemo(() => ({ ...snapshot, start: mic.start, stop: mic.stop }), [snapshot, mic]);
}
