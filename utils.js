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

  let result = ''
  let inString = false
  let isEscaped = false
  let lastIndex = 0

  for (let i = 0; i < str.length; i++) {
    const c = str[i]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (c === '\\') {
        isEscaped = true
      } else if (c === '"') {
        inString = false
      } else {
        const code = c.charCodeAt(0)
        if (code <= 0x1f) {
          result += str.slice(lastIndex, i)
          if (c === '\n') result += '\\n'
          else if (c === '\r') result += '\\r'
          else if (c === '\t') result += '\\t'
          else result += `\\u${code.toString(16).padStart(4, '0')}`
          lastIndex = i + 1
        }
      }
    } else {
      if (c === '"') {
        inString = true
      }
    }
  }

  if (lastIndex < str.length) {
    result += str.slice(lastIndex)
  }

  return result
}
