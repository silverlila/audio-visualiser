import { describe, it, expect } from "vitest";
import { createHistory } from "../src/history";

describe("history", () => {
  it("history at(age) returns newest first and wraps", () => {
    const history = createHistory(4);
    for (let value = 1; value <= 6; value++) history.push(value);

    expect(history.at(0)).toBe(6);
    expect(history.at(1)).toBe(5);
    expect(history.at(3)).toBe(3);
    expect(history.at(4)).toBe(0);
    expect(history.at(-1)).toBe(0);
    expect(history.length).toBe(4);
  });

  it("history reports only the samples pushed before it fills", () => {
    const history = createHistory(4);
    history.push(7);
    history.push(8);

    expect(history.length).toBe(2);
    expect(history.at(0)).toBe(8);
    expect(history.at(1)).toBe(7);
    expect(history.at(2)).toBe(0);
  });

  it("history clear resets length and phase", () => {
    const history = createHistory(4);
    history.push(1);
    history.push(2);
    history.setPhase(0.5);

    history.clear();

    expect(history.length).toBe(0);
    expect(history.phase).toBe(0);
    expect(history.at(0)).toBe(0);
    history.push(9);
    expect(history.at(0)).toBe(9);
    expect(history.length).toBe(1);
  });

  it("history setPhase clamps to [0, 1)", () => {
    const history = createHistory(4);

    history.setPhase(0.25);
    expect(history.phase).toBe(0.25);

    history.setPhase(-0.5);
    expect(history.phase).toBe(0);

    history.setPhase(1.5);
    expect(history.phase).toBeLessThan(1);
    expect(history.phase).toBeGreaterThan(0.999);

    history.setPhase(NaN);
    expect(history.phase).toBe(0);
  });

  it("history methods work when detached from the object", () => {
    const history = createHistory(2);
    const { push, at } = history;
    push(3);
    expect(at(0)).toBe(3);
  });

  it("createHistory rejects a capacity below 1", () => {
    expect(() => createHistory(0)).toThrow(RangeError);
    expect(() => createHistory(2.5)).toThrow(RangeError);
  });
});
