/**
 * Fix literal control characters (CR, LF, Tab) inside JSON string values.
 * batchexecute responses can contain raw control characters inside strings which is
 * invalid JSON. This replaces them with their escaped counterparts.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Replace nested regexes with a single-pass state machine loop.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  let result = ''
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
        // control char
        result += str.slice(lastIndex, i)
        if (code === 10) result += '\\n'
        else if (code === 13) result += '\\r'
        else if (code === 9) result += '\\t'
        else result += `\\u${code.toString(16).padStart(4, '0')}`
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
    result += str.slice(lastIndex)
  }

  return result
}
