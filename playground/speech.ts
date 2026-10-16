/**
 * Turns Web Speech recognition results into final and interim transcript text.
 *
 * The DOM `SpeechRecognitionResult` exposes alternatives through an index signature only, so
 * `readResults` accepts a structural subset.
 */

type RecognitionResult = {
  readonly isFinal: boolean;
  readonly [alternative: number]: { readonly transcript: string };
};

export function readResults(
  results: ArrayLike<RecognitionResult>,
  resultIndex: number,
): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = resultIndex; i < results.length; i++) {
    const { isFinal, 0: alternative } = results[i];
    if (isFinal) final = appendFinal(final, alternative.transcript);
    else interim = appendFinal(interim, alternative.transcript);
  }
  return { final, interim };
}

export function appendFinal(previous: string, chunk: string): string {
  const trimmed = chunk.trim();
  if (trimmed === "") return previous;
  if (previous === "") return trimmed;
  return `${previous} ${trimmed}`;
}
