/** Structural subset of the DOM SpeechRecognitionResult, whose alternatives are index-signature only. */
type RecognitionResult = {
  readonly isFinal: boolean;
  readonly [alternative: number]: { readonly transcript: string };
};

/** Final and interim text from one SpeechRecognition result event, from resultIndex on. */
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

/** Appends a final chunk with exactly one space between chunks; trims chunk edges; empty chunk returns previous. */
export function appendFinal(previous: string, chunk: string): string {
  const trimmed = chunk.trim();
  if (trimmed === "") return previous;
  if (previous === "") return trimmed;
  return `${previous} ${trimmed}`;
}
