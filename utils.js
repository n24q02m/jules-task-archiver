/**
 * Fix literal control characters (CR, LF, Tab) inside JSON string values.
 * batchexecute responses can contain raw control characters inside strings which is
 * invalid JSON. This replaces them with their escaped counterparts.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Replace ReDoS-vulnerable and slow double-regex with a single-pass state machine
  // Bypass processing with a fast regex test for rare conditions.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  let result = ''
  let lastIndex = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (char === '\\') {
        isEscaped = true
      } else if (char === '"') {
        inString = false
      } else {
        const code = str.charCodeAt(i)
        if (code <= 0x1f) {
          result += str.slice(lastIndex, i)
          if (char === '\n') result += '\\n'
          else if (char === '\r') result += '\\r'
          else if (char === '\t') result += '\\t'
          else result += `\\u${code.toString(16).padStart(4, '0')}`
          lastIndex = i + 1
        }
      }
    } else {
      if (char === '"') {
        inString = true
      }
    }
  }

  if (lastIndex < str.length) {
    result += str.slice(lastIndex)
  }

  return result
}
