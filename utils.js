/**
 * Fix literal control characters (CR, LF, Tab) inside JSON string values.
 * batchexecute responses can contain raw control characters inside strings which is
 * invalid JSON. This replaces them with their escaped counterparts.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Replace ReDoS-vulnerable nested regex with a single-pass state machine.
  // This is significantly faster for large payloads and prevents backtracking attacks.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  let result = ''
  let inString = false
  let isEscaped = false
  let lastIndex = 0

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (charCode === 0x5c) {
        // '\\'
        isEscaped = true
      } else if (charCode === 0x22) {
        // '"'
        inString = false
      } else if (charCode <= 0x1f) {
        // Control character inside a string
        result += str.substring(lastIndex, i)
        if (charCode === 0x0a) {
          result += '\\n'
        } else if (charCode === 0x0d) {
          result += '\\r'
        } else if (charCode === 0x09) {
          result += '\\t'
        } else {
          result += `\\u${charCode.toString(16).padStart(4, '0')}`
        }
        lastIndex = i + 1
      }
    } else {
      if (charCode === 0x22) {
        // '"'
        inString = true
      }
    }
  }

  if (lastIndex < str.length) {
    result += str.substring(lastIndex)
  }

  return result
}
