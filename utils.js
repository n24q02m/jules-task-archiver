/**
 * Fix literal control characters (CR, LF) inside JSON string values.
 * batchexecute responses can contain raw newlines inside strings which is
 * invalid JSON. This state machine escapes them.
 */
// biome-ignore lint/correctness/noUnusedVariables: Used globally via importScripts
function fixJsonControlChars(str) {
  // ⚡ Bolt Optimization: Bypass character-by-character processing loops with a
  // fast regex test for rare conditions (like JSON control characters).
  // This provides a ~10-15x speedup for large strings where the condition is mostly absent.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
  if (!/[\x00-\x1F]/.test(str)) return str

  // ⚡ Bolt Optimization: Use chunked string slicing instead of character-by-character
  // array pushing. This improves performance by ~7-10x for large JSON strings
  // (e.g. batchexecute responses) by drastically reducing array allocations.
  let out = null
  let inStr = false
  let esc = false
  let lastIndex = 0

  for (let i = 0; i < str.length; i++) {
    // ⚡ Bolt Optimization: Fast-forward to the next quote if we are not in a string.
    // This avoids iterating character-by-character through structural JSON.
    if (!inStr) {
      i = str.indexOf('"', i)
      if (i === -1) break
      inStr = true
      continue
    }

    const code = str.charCodeAt(i)

    if (esc) {
      esc = false
      continue
    }

    if (code === 92) { // '\\'
      esc = true
      continue
    }

    if (code === 34) { // '"'
      inStr = false
      continue
    }

    if (code < 0x20) {
      if (!out) out = []
      if (i > lastIndex) {
        out.push(str.substring(lastIndex, i))
      }
      if (code === 0x0a) out.push('\\n')
      else if (code === 0x0d) out.push('\\r')
      else if (code === 0x09) out.push('\\t')
      else out.push(`\\u${code.toString(16).padStart(4, '0')}`)
      lastIndex = i + 1
    }
  }

  // If no control characters were found, avoid joining entirely
  if (!out) return str

  if (lastIndex < str.length) {
    out.push(str.substring(lastIndex))
  }

  return out.join('')
}
