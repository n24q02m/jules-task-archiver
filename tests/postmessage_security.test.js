const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

describe('PostMessage Security', () => {
  it('main-world.js should NOT use wildcard origin for postMessage', () => {
    const content = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
    assert.ok(
      !content.includes(
        'postMessage(' +
          '{' +
          "\n      type: 'JULES_ARCHIVER_CONFIG',\n      config: w\n        ? {\n            at: w.SNlM0e || null,\n            bl: w.cfb2h || null,\n            fsid: w.FdrFJe || null,\n            modelId: modelMatch ? modelMatch[0] : null,\n            timestamp: Date.now()\n          }\n        : null\n    }, '*'"
      ),
      'Should not use "*" for JULES_ARCHIVER_CONFIG'
    )
    assert.ok(content.includes('window.location.origin'), 'Should use window.location.origin')
  })

  it('content.js should NOT use wildcard origin for postMessage', () => {
    const content = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
    assert.ok(
      !content.includes("window.postMessage({ type: 'JULES_REQUEST_CONFIG' }, '*')"),
      'Should not use "*" for JULES_REQUEST_CONFIG'
    )
    assert.ok(content.includes('window.location.origin'), 'Should use window.location.origin')
  })

  it('Source code should not contain postMessage(..., "*")', () => {
    const mainWorld = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
    const contentJs = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')

    const wildcardRegex = /postMessage\s*\(\s*\{[^}]+\}\s*,\s*['"]\*['"]\s*\)/

    assert.strictEqual(wildcardRegex.test(mainWorld), false, 'main-world.js should not contain postMessage with "*"')
    assert.strictEqual(wildcardRegex.test(contentJs), false, 'content.js should not contain postMessage with "*"')
  })
})
