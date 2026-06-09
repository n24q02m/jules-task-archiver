/**
 * Fix literal control characters (CR, LF, Tab) inside JSON string values.
 * batchexecute responses can contain raw control characters inside strings which is
 * invalid JSON. This replaces them with their escaped counterparts.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Bypass processing with a fast regex test for rare conditions.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  // Matches JSON string literals, accounting for escaped quotes.
  // Inside these strings, we replace raw control characters.
  return str.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
    return match.replace(/[\x00-\x1F]/g, (c) => {
      if (c === '\n') return '\\n'
      if (c === '\r') return '\\r'
      if (c === '\t') return '\\t'
      return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    })
  })
}
