const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

describe('PostMessage Security', () => {
  const insecureRegex = /postMessage\s*\([\s\S]+?,\s*['"]\*['"]\s*\)/g

  it('main-world.js should not use "*" as target origin', () => {
    const content = fs.readFileSync(path.join(__dirname, '../main-world.js'), 'utf8')
    const matches = content.match(insecureRegex)
    assert.strictEqual(
      matches,
      null,
      `Found insecure postMessage with "*" target origin in main-world.js: ${JSON.stringify(matches)}`
    )
  })

  it('content.js should not use "*" as target origin', () => {
    const content = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8')
    const matches = content.match(insecureRegex)
    assert.strictEqual(
      matches,
      null,
      `Found insecure postMessage with "*" target origin in content.js: ${JSON.stringify(matches)}`
    )
  })
})
