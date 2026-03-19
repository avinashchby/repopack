import stripComments from 'strip-comments';

export interface CompressOptions {
  stripComments: boolean;
  collapseBlankLines: boolean;
}

/** Language identifier used to select comment-stripping strategy. */
export type Language = 'javascript' | 'python' | 'unknown';

const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const PY_EXTENSIONS = new Set(['.py']);

/** Derive a language tag from a file path's extension. */
export function getLanguageFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return 'unknown';
  const ext = filePath.slice(dot).toLowerCase();
  if (JS_EXTENSIONS.has(ext)) return 'javascript';
  if (PY_EXTENSIONS.has(ext)) return 'python';
  return 'unknown';
}

/** Strip `#`-style line comments and triple-quoted docstrings from Python source. */
function stripPythonComments(content: string): string {
  // Remove triple-quoted docstrings (both """ and '''), non-greedy, DOTALL-equivalent via [\s\S]
  let result = content.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '');
  // Remove # comments (not inside strings — best-effort regex approach)
  result = result.replace(/#[^\n]*/g, '');
  return result;
}

/** Replace runs of more than one consecutive blank line with a single blank line. */
function collapseBlankLines(content: string): string {
  return content.replace(/(\r?\n){3,}/g, '\n\n');
}

/** Trim trailing whitespace from every line. */
function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/** Apply comment stripping for the detected language. */
function applyCommentStripping(content: string, language: string): string {
  if (language === 'javascript') {
    return stripComments(content, { keepProtected: false });
  }
  if (language === 'python') {
    return stripPythonComments(content);
  }
  // Unknown languages: leave comments untouched.
  return content;
}

/**
 * Compress source file content by optionally stripping comments and collapsing
 * blank lines.  Trailing whitespace is trimmed whenever `collapseBlankLines`
 * is enabled (keeps output tidy at no extra cost).
 */
export function compressContent(
  content: string,
  filePath: string,
  options: CompressOptions,
): string {
  const language = getLanguageFromPath(filePath);
  let result = content;

  if (options.stripComments) {
    result = applyCommentStripping(result, language);
  }

  if (options.collapseBlankLines) {
    result = trimTrailingWhitespace(result);
    result = collapseBlankLines(result);
  }

  return result;
}
