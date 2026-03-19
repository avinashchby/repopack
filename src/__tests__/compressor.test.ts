import { describe, it, expect } from "vitest";
import { compressContent, getLanguageFromPath } from "../compressor.js";

// ---------------------------------------------------------------------------
// getLanguageFromPath
// ---------------------------------------------------------------------------

describe("getLanguageFromPath", () => {
  it("returns javascript for .ts files", () => {
    expect(getLanguageFromPath("app.ts")).toBe("javascript");
  });

  it("returns javascript for .jsx and .mjs", () => {
    expect(getLanguageFromPath("comp.jsx")).toBe("javascript");
    expect(getLanguageFromPath("mod.mjs")).toBe("javascript");
  });

  it("returns python for .py files", () => {
    expect(getLanguageFromPath("script.py")).toBe("python");
  });

  it("returns unknown for extensionless files", () => {
    expect(getLanguageFromPath("Dockerfile")).toBe("unknown");
  });

  it("returns unknown for unrecognised extensions", () => {
    expect(getLanguageFromPath("config.toml")).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// JS comment stripping
// ---------------------------------------------------------------------------

describe("compressContent — JavaScript", () => {
  const jsOpts = { stripComments: true, collapseBlankLines: false };

  it("strips single-line comments", () => {
    const src = "const x = 1; // initialise x\nconst y = 2;";
    const out = compressContent(src, "app.ts", jsOpts);
    expect(out).not.toContain("initialise x");
    expect(out).toContain("const x = 1;");
  });

  it("strips multi-line comments", () => {
    const src = "/* block comment */\nconst z = 3;";
    const out = compressContent(src, "app.js", jsOpts);
    expect(out).not.toContain("block comment");
    expect(out).toContain("const z = 3;");
  });
});

// ---------------------------------------------------------------------------
// Python comment stripping
// ---------------------------------------------------------------------------

describe("compressContent — Python", () => {
  const pyOpts = { stripComments: true, collapseBlankLines: false };

  it("strips hash comments", () => {
    const src = "x = 1  # set x\ny = 2";
    const out = compressContent(src, "script.py", pyOpts);
    expect(out).not.toContain("set x");
    expect(out).toContain("x = 1");
  });

  it("strips triple-quoted docstrings", () => {
    const src = '"""Module docstring."""\ndef fn(): pass';
    const out = compressContent(src, "mod.py", pyOpts);
    expect(out).not.toContain("Module docstring");
    expect(out).toContain("def fn(): pass");
  });
});

// ---------------------------------------------------------------------------
// Blank line collapsing
// ---------------------------------------------------------------------------

describe("compressContent — collapseBlankLines", () => {
  const opts = { stripComments: false, collapseBlankLines: true };

  it("collapses three or more blank lines into two", () => {
    const src = "a\n\n\n\nb";
    const out = compressContent(src, "file.ts", opts);
    expect(out).toBe("a\n\nb");
  });

  it("leaves a single blank line unchanged", () => {
    const src = "a\n\nb";
    const out = compressContent(src, "file.ts", opts);
    expect(out).toBe("a\n\nb");
  });
});

// ---------------------------------------------------------------------------
// Unknown language passthrough
// ---------------------------------------------------------------------------

describe("compressContent — unknown language", () => {
  it("leaves content unchanged when stripComments is true", () => {
    const src = "# this comment stays\nkey = value";
    const out = compressContent(src, "Makefile", {
      stripComments: true,
      collapseBlankLines: false,
    });
    expect(out).toContain("# this comment stays");
  });
});
