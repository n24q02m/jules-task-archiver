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

  let out = ''
  let lastIndex = 0
  let inString = false
  let isEscaped = false

  // Single-pass state machine using charCodeAt avoids large intermediate string
  // allocations and iteration overhead of nested regex replaces.
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (charCode === 92) {
        // '\\'
        isEscaped = true
      } else if (charCode === 34) {
        // '"'
        inString = false
      } else if (charCode < 0x20) {
        // Append chunk before control char
        out += str.slice(lastIndex, i)
        lastIndex = i + 1

        if (charCode === 10) out += '\\n'
        else if (charCode === 13) out += '\\r'
        else if (charCode === 9) out += '\\t'
        else out += `\\u${charCode.toString(16).padStart(4, '0')}`
      }
    } else {
      if (charCode === 34) {
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
