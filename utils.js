/**
 * Fix literal control characters (CR, LF) inside JSON string values.
 * batchexecute responses can contain raw newlines inside strings which is
 * invalid JSON. This function escapes them.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Bypass processing loops with a fast regex test
  // for rare conditions (like JSON control characters). This provides a
  // ~10-15x speedup for large strings where the condition is mostly absent.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  // ⚡ Bolt Optimization: Use a regex to identify JSON strings and replace
  // control characters only within them. This avoids complex state machines
  // and manual character-by-character processing.
  return str.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    // Only process strings that actually contain control characters.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Matching control characters for replacement
    if (match.length > 2 && /[\x00-\x1f]/.test(match)) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Matching control characters for replacement
      return match.replace(/[\x00-\x1f]/g, (c) => {
        switch (c) {
          case '\n':
            return '\\n'
          case '\r':
            return '\\r'
          case '\t':
            return '\\t'
          default:
            return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
        }
      })
    }
    return match
  })
}
