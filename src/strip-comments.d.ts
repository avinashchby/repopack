declare module 'strip-comments' {
  interface StripOptions {
    /** Keep protected comments (e.g. /*! ... *‌/) when true. Default: true. */
    keepProtected?: boolean;
    /** Preserve newlines where comments were removed. Default: false. */
    preserveNewlines?: boolean;
  }

  /**
   * Strip line and block comments from a string of source code.
   * The package auto-detects the language from content heuristics.
   */
  function stripComments(input: string, options?: StripOptions): string;
  export default stripComments;
}
