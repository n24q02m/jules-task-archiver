const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const utilsScriptPath = path.join(__dirname, '..', 'utils.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')
const utilsScriptContent = fs.readFileSync(utilsScriptPath, 'utf8')

function setup() {
  const sandbox = {
    chrome: {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) },
        local: { get: async () => ({}) }
      },
      runtime: { onMessage: { addListener: () => {} } }
    },
    setTimeout,
    setInterval: () => {},
    console,
    Error,
    JSON,
    Array,
    String,
    Math,
    Object,
    Promise,
    parseInt,
    crypto: { getRandomValues: (arr) => arr },
    importScripts: () => {},
    globalThis: {}
  }
  vm.createContext(sandbox)
  sandbox.globalThis = sandbox
  vm.runInContext(utilsScriptContent + bgScriptContent, sandbox)
  // Expose parseResponse if not already global
  vm.runInContext('globalThis.parseResponse = parseResponse', sandbox)
  return sandbox
}

describe('parseResponse Type Validation Security', () => {
  it('should throw if outer is not an array', () => {
    const sandbox = setup()
    // Valid XSS prefix + newline + byte count + non-array JSON object
    const text = ')]}\'\n\n10\n{"not": "an array"}'
    assert.throws(() => sandbox.parseResponse(text, 'rpcId'), {
      message: 'Invalid batchexecute response: expected array'
    })
  })

  it('should return null if inner result is not an array', () => {
    const sandbox = setup()
    // outer is [[null, "rpcId", "{\"not\": \"an array\"}"]]
    const innerPayload = JSON.stringify({ not: 'an array' })
    const outer = [[null, 'rpcId', innerPayload]]
    const text = `)]}'\n\n100\n${JSON.stringify(outer)}`

    const result = sandbox.parseResponse(text, 'rpcId')
    assert.strictEqual(result, null)
  })

  it('should return null if entry[2] is not a string', () => {
    const sandbox = setup()
    // entry[2] is a number instead of a string
    const outer = [[null, 'rpcId', 12345]]
    const text = `)]}'\n\n100\n${JSON.stringify(outer)}`

    const result = sandbox.parseResponse(text, 'rpcId')
    assert.strictEqual(result, null)
  })

  it('should return null if rpcId is not found', () => {
    const sandbox = setup()
    const outer = [[null, 'otherRpc', '[]']]
    const text = `)]}'\n\n100\n${JSON.stringify(outer)}`

    const result = sandbox.parseResponse(text, 'rpcId')
    assert.strictEqual(result, null)
  })

  it('should parse valid response', () => {
    const sandbox = setup()
    const innerData = ['task1', 'Title']
    const outer = [[null, 'rpcId', JSON.stringify(innerData)]]
    const text = `)]}'\n\n100\n${JSON.stringify(outer)}`

    const result = sandbox.parseResponse(text, 'rpcId')
    assert.deepStrictEqual(result, innerData)
  })
})
