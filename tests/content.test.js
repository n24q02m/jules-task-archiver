const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('content.js config extraction logic', () => {
  // We test the pure logic that would run in MAIN world
  // (the actual WIZ_global_data read and postMessage)

  it('should extract all 3 tokens from WIZ_global_data', () => {
    const mockWizData = {
      SNlM0e: 'ANg1qqfv83OjshGW-Un9dvTHouaU:1774954769486',
      cfb2h: 'boq_labs-language-aida-swebot-uiserver_20260330.02_p0',
      FdrFJe: '-3744815140919849526',
      otherKey: 'ignored'
    }

    // Simulate the extraction logic from the injected script
    const config = mockWizData
      ? {
          at: mockWizData.SNlM0e || null,
          bl: mockWizData.cfb2h || null,
          fsid: mockWizData.FdrFJe || null
        }
      : null

    assert.strictEqual(config.at, 'ANg1qqfv83OjshGW-Un9dvTHouaU:1774954769486')
    assert.strictEqual(config.bl, 'boq_labs-language-aida-swebot-uiserver_20260330.02_p0')
    assert.strictEqual(config.fsid, '-3744815140919849526')
  })

  it('should return null when WIZ_global_data is missing', () => {
    const mockWizData = undefined
    const config = mockWizData
      ? { at: mockWizData.SNlM0e || null, bl: mockWizData.cfb2h || null, fsid: mockWizData.FdrFJe || null }
      : null

    assert.strictEqual(config, null)
  })

  it('should return null for missing individual tokens', () => {
    const mockWizData = { cfb2h: 'build-label' }
    const config = {
      at: mockWizData.SNlM0e || null,
      bl: mockWizData.cfb2h || null,
      fsid: mockWizData.FdrFJe || null
    }

    assert.strictEqual(config.at, null)
    assert.strictEqual(config.bl, 'build-label')
    assert.strictEqual(config.fsid, null)
  })

  it('should parse account number from URL paths', () => {
    function getAccountNum(url) {
      const m = new URL(url).pathname.match(/\/u\/(\d+)/)
      return m ? m[1] : '0'
    }

    assert.strictEqual(getAccountNum('https://jules.google.com/u/3/session'), '3')
    assert.strictEqual(getAccountNum('https://jules.google.com/u/0/repo/github/foo/bar'), '0')
    assert.strictEqual(getAccountNum('https://jules.google.com/session'), '0')
  })

  it('should extract config with modelId from TSDtV', () => {
    // Simulate the updated extraction logic that includes modelId
    const mockWizData = {
      SNlM0e: 'token123',
      cfb2h: 'build-label',
      FdrFJe: '-123',
      TSDtV: '%.@.[[null,[[45755236,null,null,null,"beyond:models/gemini-v4p1m-rev24-snowball",null,"RZYmC"]]]]'
    }

    const modelMatch = mockWizData.TSDtV ? String(mockWizData.TSDtV).match(/beyond:models\/[\w-]+/) : null
    const config = {
      at: mockWizData.SNlM0e || null,
      bl: mockWizData.cfb2h || null,
      fsid: mockWizData.FdrFJe || null,
      modelId: modelMatch ? modelMatch[0] : null
    }

    assert.strictEqual(config.modelId, 'beyond:models/gemini-v4p1m-rev24-snowball')
  })

  it('should return null modelId when TSDtV has no model', () => {
    const mockWizData = {
      SNlM0e: 'token123',
      cfb2h: 'build-label',
      FdrFJe: '-123',
      TSDtV: '%.@.[[null,[[45724102,null,true]]]]'
    }

    const modelMatch = mockWizData.TSDtV ? String(mockWizData.TSDtV).match(/beyond:models\/[\w-]+/) : null
    const config = {
      modelId: modelMatch ? modelMatch[0] : null
    }

    assert.strictEqual(config.modelId, null)
  })

  it('should return null modelId when TSDtV is missing', () => {
    const mockWizData = {
      SNlM0e: 'token123',
      cfb2h: 'build-label',
      FdrFJe: '-123'
    }

    const modelMatch = mockWizData.TSDtV ? String(mockWizData.TSDtV).match(/beyond:models\/[\w-]+/) : null
    const config = {
      modelId: modelMatch ? modelMatch[0] : null
    }

    assert.strictEqual(config.modelId, null)
  })
})
