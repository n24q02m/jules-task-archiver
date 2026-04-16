const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

describe('Origin Security: window.postMessage', () => {
  const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
  const mainWorldJs = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')

  it('content.js should not use "*" as target origin in any postMessage calls', () => {
    const insecureMatches = contentJs.match(/postMessage\s*\([\s\S]+?,\s*['"]\*['"]\s*\)/g)
    assert.strictEqual(insecureMatches, null, `Insecure postMessage calls found in content.js: ${insecureMatches}`)
  })

  it('main-world.js should not use "*" as target origin in any postMessage calls', () => {
    const insecureMatches = mainWorldJs.match(/postMessage\s*\([\s\S]+?,\s*['"]\*['"]\s*\)/g)
    assert.strictEqual(insecureMatches, null, `Insecure postMessage calls found in main-world.js: ${insecureMatches}`)
  })
})
