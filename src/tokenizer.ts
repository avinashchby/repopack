/**
 * Token counting module using tiktoken's cl100k_base encoding.
 *
 * Claude and Gemini do not publish a tiktoken-compatible encoder, so
 * cl100k_base is used as an approximation for both — consistent with how
 * most OSS tooling handles this.
 */

import { createRequire } from "node:module";
import { Tiktoken } from "tiktoken/lite";

// createRequire lets us load the CJS encoder bundle from an ES module without
// import-attribute syntax or ESM/CJS interop ambiguity.
const require = createRequire(import.meta.url);

interface EncoderData {
  pat_str: string;
  special_tokens: Record<string, number>;
  bpe_ranks: string;
}

const cl100kBase = require("tiktoken/encoders/cl100k_base.json") as EncoderData;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelTokenInfo {
  /** Display name of the model. */
  name: string;
  /** Maximum context window in tokens. */
  contextLimit: number;
  /** Total tokens in the input (same for all models when sharing an encoder). */
  usage: number;
  /** usage / contextLimit expressed as a percentage (0–100+). */
  percentUsed: number;
  /** True when usage exceeds contextLimit. */
  exceedsLimit: boolean;
}

export interface TokenStats {
  totalTokens: number;
  models: ModelTokenInfo[];
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

interface ModelSpec {
  name: string;
  contextLimit: number;
}

const MODEL_SPECS: ModelSpec[] = [
  { name: "GPT-4", contextLimit: 128_000 },
  { name: "Claude", contextLimit: 200_000 },
  { name: "Gemini", contextLimit: 1_000_000 },
];

// ---------------------------------------------------------------------------
// Encoder lifecycle
// ---------------------------------------------------------------------------

/**
 * Build a Tiktoken encoder from the bundled cl100k_base data.
 * The caller is responsible for calling enc.free() when done.
 */
function buildEncoder(): Tiktoken {
  return new Tiktoken(
    cl100kBase.bpe_ranks,
    cl100kBase.special_tokens,
    cl100kBase.pat_str,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Count the number of cl100k_base tokens in `text`.
 *
 * @throws {Error} If the tiktoken encoder cannot be initialised.
 */
export function countTokens(text: string): number {
  const enc = buildEncoder();
  try {
    return enc.encode(text).length;
  } finally {
    enc.free();
  }
}

/**
 * Return token usage statistics broken down per model.
 *
 * @throws {Error} If the tiktoken encoder cannot be initialised.
 */
export function getTokenStats(text: string): TokenStats {
  const totalTokens = countTokens(text);

  const models: ModelTokenInfo[] = MODEL_SPECS.map(({ name, contextLimit }) => {
    const percentUsed = (totalTokens / contextLimit) * 100;
    return {
      name,
      contextLimit,
      usage: totalTokens,
      percentUsed,
      exceedsLimit: totalTokens > contextLimit,
    };
  });

  return { totalTokens, models };
}

/**
 * Format a {@link TokenStats} object into a human-readable, multi-line string.
 * Logs a warning to stderr for every model whose context limit is exceeded.
 */
export function formatTokenStats(stats: TokenStats): string {
  const lines: string[] = [
    `Total tokens: ${stats.totalTokens.toLocaleString()}`,
    "",
    "Model context usage:",
  ];

  for (const m of stats.models) {
    const pct = m.percentUsed.toFixed(1);
    const status = m.exceedsLimit ? " [EXCEEDS LIMIT]" : "";
    lines.push(
      `  ${m.name.padEnd(10)} ${m.usage.toLocaleString()} / ${m.contextLimit.toLocaleString()} tokens (${pct}%)${status}`,
    );

    if (m.exceedsLimit) {
      const over = (m.usage - m.contextLimit).toLocaleString();
      console.warn(
        `Warning: token count exceeds ${m.name} context limit by ${over} tokens.`,
      );
    }
  }

  return lines.join("\n");
}
