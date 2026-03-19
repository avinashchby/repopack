import { describe, it, expect } from "vitest";
import { getLanguageId, formatOutput } from "../formatter.js";

// ---------------------------------------------------------------------------
// getLanguageId
// ---------------------------------------------------------------------------

describe("getLanguageId", () => {
  it("maps .ts to typescript", () => {
    expect(getLanguageId("src/app.ts")).toBe("typescript");
  });

  it("maps .py to python", () => {
    expect(getLanguageId("script.py")).toBe("python");
  });

  it("maps .rs to rust", () => {
    expect(getLanguageId("main.rs")).toBe("rust");
  });

  it("maps .yaml and .yml to yaml", () => {
    expect(getLanguageId("config.yaml")).toBe("yaml");
    expect(getLanguageId("config.yml")).toBe("yaml");
  });

  it("returns empty string for unknown extensions", () => {
    expect(getLanguageId("file.xyz")).toBe("");
  });

  it("maps extensionless Dockerfile", () => {
    expect(getLanguageId("Dockerfile")).toBe("dockerfile");
    expect(getLanguageId("path/to/Dockerfile")).toBe("dockerfile");
  });

  it("maps extensionless Makefile", () => {
    expect(getLanguageId("Makefile")).toBe("makefile");
    expect(getLanguageId("GNUmakefile")).toBe("makefile");
  });

  it("maps .env files", () => {
    expect(getLanguageId(".env")).toBe("dotenv");
    expect(getLanguageId(".env.local")).toBe("dotenv");
  });
});

// ---------------------------------------------------------------------------
// formatOutput
// ---------------------------------------------------------------------------

describe("formatOutput", () => {
  const base = {
    projectName: "myrepo",
    fileTree: "myrepo\n└── index.ts",
    files: [{ path: "index.ts", content: "export const x = 1;" }],
    totalTokens: 42,
  };

  it("includes the project name in the header", () => {
    const out = formatOutput(base);
    expect(out).toContain("# Repository: myrepo");
  });

  it("includes a File Tree section with the tree content", () => {
    const out = formatOutput(base);
    expect(out).toContain("## File Tree");
    expect(out).toContain("└── index.ts");
  });

  it("includes a fenced code block for each file", () => {
    const out = formatOutput(base);
    expect(out).toContain("## index.ts");
    expect(out).toContain("```typescript");
    expect(out).toContain("export const x = 1;");
    expect(out).toContain("```");
  });

  it("shows file count and token count in header line", () => {
    const out = formatOutput(base);
    expect(out).toContain("1 files");
    expect(out).toContain("~42 tokens");
  });

  it("renders multiple files as separate sections", () => {
    const opts = {
      ...base,
      files: [
        { path: "a.ts", content: "a" },
        { path: "b.py", content: "b" },
      ],
    };
    const out = formatOutput(opts);
    expect(out).toContain("## a.ts");
    expect(out).toContain("```typescript");
    expect(out).toContain("## b.py");
    expect(out).toContain("```python");
  });
});
