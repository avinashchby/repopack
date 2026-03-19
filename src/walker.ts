import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { type Ignore } from "ignore";

// "ignore" is a CJS package. With Node16 moduleResolution we must use a
// dynamic import or createRequire to get the callable factory. We use
// createRequire so the call is synchronous and the types stay clean.
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const ignore: () => Ignore = _require("ignore");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WalkerOptions {
  rootDir: string;
  include?: string[];
  exclude?: string[];
}

export interface WalkerResult {
  files: string[]; // relative paths, sorted
  fileTree: string; // tree-command-style string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".lock",
]);

const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".env",
  ".env.*",
];

// ---------------------------------------------------------------------------
// Ignore-file helpers
// ---------------------------------------------------------------------------

async function readIgnoreFile(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}

async function buildIgnoreFilter(rootDir: string): Promise<Ignore> {
  const ig = ignore();

  ig.add(DEFAULT_EXCLUDE_PATTERNS);

  const gitignorePath = path.join(rootDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(await readIgnoreFile(gitignorePath));
  }

  const repopackIgnorePath = path.join(rootDir, ".repopackignore");
  if (existsSync(repopackIgnorePath)) {
    ig.add(await readIgnoreFile(repopackIgnorePath));
  }

  return ig;
}

// ---------------------------------------------------------------------------
// File-collection helpers
// ---------------------------------------------------------------------------

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function buildGlobPatterns(include?: string[]): string[] {
  return include && include.length > 0 ? include : ["**/*"];
}

function buildIgnoredPatterns(exclude?: string[]): string[] {
  return exclude && exclude.length > 0
    ? [...DEFAULT_EXCLUDE_PATTERNS, ...exclude]
    : DEFAULT_EXCLUDE_PATTERNS;
}

async function collectFiles(
  rootDir: string,
  ig: Ignore,
  include?: string[],
  exclude?: string[],
): Promise<string[]> {
  const patterns = buildGlobPatterns(include);
  const ignored = buildIgnoredPatterns(exclude);

  const entries = await fg(patterns, {
    cwd: rootDir,
    dot: true,
    onlyFiles: true,
    ignore: ignored,
    followSymbolicLinks: false,
  });

  return entries
    .filter((f) => !ig.ignores(f))
    .filter((f) => !isBinaryFile(f))
    .sort();
}

// ---------------------------------------------------------------------------
// File-tree helpers
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: ".", children: new Map(), isFile: false };

  for (const file of files) {
    const parts = file.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          children: new Map(),
          isFile: i === parts.length - 1,
        });
      }
      node = node.children.get(part)!;
    }
  }

  return root;
}

function renderTree(node: TreeNode, prefix: string = ""): string {
  const lines: string[] = [];
  const entries = [...node.children.values()].sort((a, b) => {
    // Directories before files, then alphabetical
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const child = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    lines.push(`${prefix}${connector}${child.name}`);
    if (!child.isFile && child.children.size > 0) {
      lines.push(renderTree(child, prefix + childPrefix));
    }
  }

  return lines.join("\n");
}

function generateFileTree(rootDir: string, files: string[]): string {
  const root = buildTree(files);
  const rootName = path.basename(rootDir);
  const body = renderTree(root);
  return body.length > 0 ? `${rootName}\n${body}` : rootName;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk a directory tree, applying .gitignore / .repopackignore rules,
 * smart defaults, and user-supplied include/exclude patterns.
 *
 * @returns Sorted relative file paths and a tree-command-style string.
 */
export async function walkDirectory(
  options: WalkerOptions,
): Promise<WalkerResult> {
  const { rootDir, include, exclude } = options;

  const ig = await buildIgnoreFilter(rootDir);
  const files = await collectFiles(rootDir, ig, include, exclude);
  const fileTree = generateFileTree(rootDir, files);

  return { files, fileTree };
}
