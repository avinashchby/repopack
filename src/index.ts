#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { program } from "commander";

import { walkDirectory } from "./walker.js";
import { compressContent } from "./compressor.js";
import { formatOutput } from "./formatter.js";
import { countTokens, getTokenStats, formatTokenStats } from "./tokenizer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliOptions {
  output: string;
  maxTokens?: string;
  include?: string;
  exclude?: string;
  compress: boolean;
  stats: boolean;
  copy: boolean;
}

interface FileEntry {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a comma-separated pattern string into a trimmed, non-empty array. */
function parsePatterns(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/** Read every relative path from rootDir, skipping unreadable files silently. */
async function readFiles(rootDir: string, relPaths: string[]): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  for (const rel of relPaths) {
    const abs = path.join(rootDir, rel);
    try {
      const content = await readFile(abs, "utf8");
      results.push({ path: rel, content });
    } catch {
      // Skip files that can't be read (permissions, deleted mid-walk, etc.)
    }
  }
  return results;
}

/** Apply compression to each file when the --compress flag is set. */
function applyCompression(files: FileEntry[]): FileEntry[] {
  return files.map((f) => ({
    path: f.path,
    content: compressContent(f.content, f.path, {
      stripComments: true,
      collapseBlankLines: true,
    }),
  }));
}

/**
 * Enforce --max-tokens by dropping the largest files (by character count) until
 * the combined output is estimated to fit within the token budget.
 *
 * We use character count as the sort key — it's a fast proxy for token count
 * and avoids encoding every file individually.
 */
function applyTokenLimit(files: FileEntry[], maxTokens: number): FileEntry[] {
  // Sort largest-first (mutate a copy).
  const sorted = [...files].sort((a, b) => b.content.length - a.content.length);
  let kept = [...files];

  // Rough estimate: 1 token ≈ 4 characters.
  const estimateTokens = (f: FileEntry): number => Math.ceil(f.content.length / 4);
  const total = () => kept.reduce((sum, f) => sum + estimateTokens(f), 0);

  for (const candidate of sorted) {
    if (total() <= maxTokens) break;
    kept = kept.filter((f) => f.path !== candidate.path);
  }

  return kept;
}

/** Copy text to the system clipboard via clipboardy (dynamic import for ESM compat). */
async function copyToClipboard(text: string): Promise<void> {
  const { default: clipboardy } = await import("clipboardy");
  await clipboardy.write(text);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  program
    .name("repopack")
    .description("Pack an entire codebase into a single LLM-optimised markdown file")
    .argument("[directory]", "Directory to pack", ".")
    .option("-o, --output <file>", "Output file path", "repopack-output.md")
    .option("--max-tokens <number>", "Truncate largest files to fit within this token limit")
    .option("--include <patterns>", "Comma-separated glob include patterns")
    .option("--exclude <patterns>", "Comma-separated glob exclude patterns")
    .option("--compress", "Strip comments and collapse whitespace", false)
    .option("--stats", "Print token stats only; do not write output", false)
    .option("--copy", "Copy output to clipboard instead of writing a file", false)
    .parse(process.argv);

  const opts = program.opts<CliOptions>();
  const [directory = "."] = program.args;

  const rootDir = path.resolve(directory);
  const outputPath = path.resolve(opts.output);
  const maxTokens = opts.maxTokens !== undefined ? parseInt(opts.maxTokens, 10) : undefined;

  if (maxTokens !== undefined && (isNaN(maxTokens) || maxTokens <= 0)) {
    process.stderr.write("Error: --max-tokens must be a positive integer.\n");
    process.exit(1);
  }

  // Step 1 — Walk the directory tree.
  let walkerResult;
  try {
    walkerResult = await walkDirectory({
      rootDir,
      include: parsePatterns(opts.include),
      exclude: parsePatterns(opts.exclude),
    });
  } catch (err) {
    process.stderr.write(`Error walking directory: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Step 2 — Read file contents.
  let files = await readFiles(rootDir, walkerResult.files);

  // Step 3 — Optionally compress.
  if (opts.compress) {
    files = applyCompression(files);
  }

  // Step 4 — Optionally trim to token budget.
  if (maxTokens !== undefined) {
    files = applyTokenLimit(files, maxTokens);
  }

  // Step 5 — Format the output document.
  const projectName = path.basename(rootDir);
  const output = formatOutput({
    projectName,
    fileTree: walkerResult.fileTree,
    files,
    totalTokens: 0, // placeholder; real count computed next
  });

  // Step 6 — Count tokens on the final output.
  let tokenCount: number;
  try {
    tokenCount = countTokens(output);
  } catch (err) {
    process.stderr.write(`Error counting tokens: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Re-format with accurate token count.
  const finalOutput = formatOutput({
    projectName,
    fileTree: walkerResult.fileTree,
    files,
    totalTokens: tokenCount,
  });

  // Step 7 — Print token stats.
  const stats = getTokenStats(finalOutput);
  const statsText = formatTokenStats(stats);

  // Step 8 — Stats-only mode.
  if (opts.stats) {
    process.stdout.write(statsText + "\n");
    return;
  }

  // Step 9 — Deliver output.
  try {
    if (opts.copy) {
      await copyToClipboard(finalOutput);
    } else {
      await writeFile(outputPath, finalOutput, "utf8");
    }
  } catch (err) {
    process.stderr.write(`Error writing output: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Step 10 — Print summary.
  const destination = opts.copy ? "clipboard" : outputPath;
  process.stdout.write(
    `Packed ${files.length} file(s) | ~${stats.totalTokens.toLocaleString()} tokens → ${destination}\n`,
  );
  process.stdout.write(statsText + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
