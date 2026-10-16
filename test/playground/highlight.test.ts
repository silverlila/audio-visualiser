import { describe, it, expect } from "vitest";
import { highlight } from "../../playground/highlight";

describe("highlight", () => {
  it("colours keywords, strings and comments in script", () => {
    expect(highlight(`const a = "x"; // hi`, "ts")).toEqual([
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " a = " },
      { kind: "string", text: `"x"` },
      { kind: "plain", text: "; " },
      { kind: "comment", text: "// hi" },
    ]);
  });

  it("does not colour a keyword inside a string or a longer word", () => {
    expect(highlight(`imported("return")`, "tsx")).toEqual([
      { kind: "plain", text: "imported(" },
      { kind: "string", text: `"return"` },
      { kind: "plain", text: ")" },
    ]);
  });

  it("treats an unclosed apostrophe in JSX text as plain text", () => {
    expect(highlight("<p>It's on</p>", "tsx")).toEqual([{ kind: "plain", text: "<p>It's on</p>" }]);
  });

  it("reads css block comments and attribute strings, and no keywords", () => {
    expect(highlight(`/* idle */ .a[data-state="done"] { color: red }`, "css")).toEqual([
      { kind: "comment", text: "/* idle */" },
      { kind: "plain", text: " .a[data-state=" },
      { kind: "string", text: `"done"` },
      { kind: "plain", text: "] { color: red }" },
    ]);
  });

  it("colours the package manager in a shell command", () => {
    expect(highlight("pnpm add audio-visualiser", "sh")).toEqual([
      { kind: "keyword", text: "pnpm" },
      { kind: "plain", text: " add audio-visualiser" },
    ]);
  });

  it("returns no tokens for empty code", () => {
    expect(highlight("", "ts")).toEqual([]);
  });
});
