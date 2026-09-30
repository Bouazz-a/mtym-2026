import { describe, expect, it } from "vitest";
import { frNote, parseRate } from "./gradingService";

describe("frNote", () => {
  it("writes notes the French way", () => {
    expect(frNote(2.25)).toBe("2,25");
    expect(frNote(0.30000000000000004)).toBe("0,3");
    expect(frNote(3)).toBe("3");
    expect(frNote(-1.25)).toBe("−1,25");
  });
});

describe("parseRate", () => {
  it("reads a comma or a dot", () => {
    expect(parseRate("0,1")).toBe(0.1);
    expect(parseRate("0.35")).toBe(0.35);
    expect(parseRate(",5")).toBe(0.5);
    expect(parseRate(" 1 ")).toBe(1);
  });

  it("keeps it between 0 and 1, to the hundredth", () => {
    expect(parseRate("1,5")).toBe(1);
    expect(parseRate("-0,2")).toBe(0);
    expect(parseRate("0,333")).toBe(0.33);
  });

  it("waits while it isn't a number yet", () => {
    expect(parseRate("")).toBeNull();
    expect(parseRate(",")).toBeNull();
    expect(parseRate("abc")).toBeNull();
    expect(parseRate("0,")).toBe(0);
  });
});
