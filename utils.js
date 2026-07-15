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
  // ⚡ Bolt Optimization: Use a single-pass state machine instead of overlapping regex quantifiers
  // to prevent regex overhead, ReDoS vulnerability, and excessive string allocations.
  let out = ''
  let lastIndex = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (code === 92) {
        // '\\'
        isEscaped = true
      } else if (code === 34) {
        // '"'
        inString = false
      } else if (code < 32) {
        // Control character
        out += str.slice(lastIndex, i)
        if (code === 10) out += '\\n'
        else if (code === 13) out += '\\r'
        else if (code === 9) out += '\\t'
        else out += `\\u${code.toString(16).padStart(4, '0')}`
        lastIndex = i + 1
      }
    } else {
      if (code === 34) {
        // '"'
        inString = true
      }
    }
  }

  if (lastIndex < str.length) {
    out += str.slice(lastIndex)
  }

  return out
}
