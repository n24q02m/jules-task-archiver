/**
 * Fix literal control characters (CR, LF, Tab) inside JSON string values.
 * batchexecute responses can contain raw control characters inside strings which is
 * invalid JSON. This replaces them with their escaped counterparts.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // 🛡️ Sentinel: Mitigate ReDoS risk. Replaced complex regex /"(?:[^"\\]|\\.)*"/g
  // with a linear-time state machine to prevent catastrophic backtracking on large untrusted inputs.
  // ⚡ Bolt Optimization: Bypass processing with a fast regex test for rare conditions.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  let result = ''
  let lastIndex = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    const char = str[i]

    if (!inString) {
      if (char === '"') {
        inString = true
      }
      continue
    }

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    if (char === '"') {
      inString = false
      continue
    }

    if (code <= 0x1f) {
      result += str.slice(lastIndex, i)
      lastIndex = i + 1

      if (char === '\n') result += '\\n'
      else if (char === '\r') result += '\\r'
      else if (char === '\t') result += '\\t'
      else result += `\\u${code.toString(16).padStart(4, '0')}`
    }
  }

  result += str.slice(lastIndex)
  return result
}
