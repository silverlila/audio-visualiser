import { describe, it, expect } from "vitest";
import { appendFinal, readResults } from "../../playground/speech";

function result(transcript: string, isFinal: boolean) {
  return { isFinal, 0: { transcript } };
}

describe("speech", () => {
  it("appendFinal accumulates text across results", () => {
    expect(appendFinal(appendFinal("", "hello"), " world ")).toBe("hello world");
  });

  it("appendFinal ignores an empty chunk", () => {
    expect(appendFinal("hello", "  ")).toBe("hello");
  });

  it("readResults separates final from interim from resultIndex on", () => {
    const results = [
      result("already handled", true),
      result("hello", true),
      result(" world", true),
      result(" how are", false),
    ];

    expect(readResults(results, 1)).toEqual({ final: "hello world", interim: "how are" });
  });

  it("readResults returns empty text when nothing is new", () => {
    expect(readResults([result("done", true)], 1)).toEqual({ final: "", interim: "" });
  });
});
