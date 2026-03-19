import { describe, it, expect } from "vitest";
import { countTokens, getTokenStats, formatTokenStats } from "../tokenizer.js";

// ---------------------------------------------------------------------------
// countTokens
// ---------------------------------------------------------------------------

describe("countTokens", () => {
  it("returns a positive integer for non-empty text", () => {
    const count = countTokens("hello world");
    expect(count).toBeGreaterThan(0);
    expect(Number.isInteger(count)).toBe(true);
  });

  it("returns 0 for an empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("longer text produces more tokens than shorter text", () => {
    const short = countTokens("hi");
    const long = countTokens("hi".repeat(100));
    expect(long).toBeGreaterThan(short);
  });
});

// ---------------------------------------------------------------------------
// getTokenStats
// ---------------------------------------------------------------------------

describe("getTokenStats", () => {
  it("returns totalTokens matching countTokens", () => {
    const text = "const x = 42;";
    const stats = getTokenStats(text);
    expect(stats.totalTokens).toBe(countTokens(text));
  });

  it("returns a models array with at least one entry", () => {
    const stats = getTokenStats("some text");
    expect(Array.isArray(stats.models)).toBe(true);
    expect(stats.models.length).toBeGreaterThan(0);
  });

  it("each model entry has the required shape", () => {
    const stats = getTokenStats("test");
    for (const m of stats.models) {
      expect(typeof m.name).toBe("string");
      expect(typeof m.contextLimit).toBe("number");
      expect(typeof m.usage).toBe("number");
      expect(typeof m.percentUsed).toBe("number");
      expect(typeof m.exceedsLimit).toBe("boolean");
    }
  });

  it("exceedsLimit is false for small input against large context windows", () => {
    const stats = getTokenStats("tiny");
    for (const m of stats.models) {
      expect(m.exceedsLimit).toBe(false);
    }
  });

  it("percentUsed is proportional to usage / contextLimit", () => {
    const stats = getTokenStats("hello world");
    for (const m of stats.models) {
      const expected = (m.usage / m.contextLimit) * 100;
      expect(m.percentUsed).toBeCloseTo(expected, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// formatTokenStats
// ---------------------------------------------------------------------------

describe("formatTokenStats", () => {
  it("output starts with Total tokens line", () => {
    const stats = getTokenStats("example text");
    const out = formatTokenStats(stats);
    expect(out.startsWith("Total tokens:")).toBe(true);
  });

  it("includes a model context usage section", () => {
    const stats = getTokenStats("example text");
    const out = formatTokenStats(stats);
    expect(out).toContain("Model context usage:");
  });

  it("lists each model by name", () => {
    const stats = getTokenStats("example text");
    const out = formatTokenStats(stats);
    for (const m of stats.models) {
      expect(out).toContain(m.name);
    }
  });

  it("includes [EXCEEDS LIMIT] marker when a model is exceeded", () => {
    const stats = {
      totalTokens: 300_000,
      models: [
        {
          name: "GPT-4",
          contextLimit: 128_000,
          usage: 300_000,
          percentUsed: 234.4,
          exceedsLimit: true,
        },
      ],
    };
    const out = formatTokenStats(stats);
    expect(out).toContain("[EXCEEDS LIMIT]");
  });
});
