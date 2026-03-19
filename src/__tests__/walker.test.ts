import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { walkDirectory } from "../walker.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "repopack-walker-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("walkDirectory", () => {
  it("returns files and fileTree for a simple directory", async () => {
    await writeFile(path.join(tmpDir, "index.ts"), "export {}");
    await writeFile(path.join(tmpDir, "README.md"), "# hello");

    const result = await walkDirectory({ rootDir: tmpDir });

    expect(result.files).toContain("index.ts");
    expect(result.files).toContain("README.md");
    expect(result.fileTree).toContain("index.ts");
    expect(result.fileTree).toContain("README.md");
  });

  it("excludes binary files by extension", async () => {
    await writeFile(path.join(tmpDir, "image.png"), Buffer.from([0x89, 0x50]));
    await writeFile(path.join(tmpDir, "font.woff2"), Buffer.from([0x00]));
    await writeFile(path.join(tmpDir, "main.ts"), "const x = 1;");

    const result = await walkDirectory({ rootDir: tmpDir });

    expect(result.files).not.toContain("image.png");
    expect(result.files).not.toContain("font.woff2");
    expect(result.files).toContain("main.ts");
  });

  it("respects .gitignore patterns", async () => {
    await writeFile(path.join(tmpDir, ".gitignore"), "dist/\n*.log");
    await mkdir(path.join(tmpDir, "dist"));
    await writeFile(path.join(tmpDir, "dist", "bundle.js"), "built");
    await writeFile(path.join(tmpDir, "debug.log"), "logs");
    await writeFile(path.join(tmpDir, "app.ts"), "code");

    const result = await walkDirectory({ rootDir: tmpDir });

    expect(result.files).not.toContain("dist/bundle.js");
    expect(result.files).not.toContain("debug.log");
    expect(result.files).toContain("app.ts");
  });

  it("honours include patterns", async () => {
    await writeFile(path.join(tmpDir, "app.ts"), "ts");
    await writeFile(path.join(tmpDir, "styles.css"), "css");

    const result = await walkDirectory({ rootDir: tmpDir, include: ["**/*.ts"] });

    expect(result.files).toContain("app.ts");
    expect(result.files).not.toContain("styles.css");
  });

  it("honours exclude patterns", async () => {
    await writeFile(path.join(tmpDir, "keep.ts"), "keep");
    await writeFile(path.join(tmpDir, "drop.ts"), "drop");

    const result = await walkDirectory({ rootDir: tmpDir, exclude: ["drop.ts"] });

    expect(result.files).toContain("keep.ts");
    expect(result.files).not.toContain("drop.ts");
  });

  it("returns sorted file list", async () => {
    await writeFile(path.join(tmpDir, "z.ts"), "z");
    await writeFile(path.join(tmpDir, "a.ts"), "a");
    await writeFile(path.join(tmpDir, "m.ts"), "m");

    const result = await walkDirectory({ rootDir: tmpDir });

    expect(result.files).toEqual([...result.files].sort());
  });

  it("produces a fileTree rooted at the directory name", async () => {
    await writeFile(path.join(tmpDir, "src.ts"), "code");

    const result = await walkDirectory({ rootDir: tmpDir });

    const rootName = path.basename(tmpDir);
    expect(result.fileTree.startsWith(rootName)).toBe(true);
  });
});
