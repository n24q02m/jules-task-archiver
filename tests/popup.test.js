const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const popupHtmlPath = path.join(__dirname, '..', 'popup.html')
const popupJsPath = path.join(__dirname, '..', 'popup.js')

const popupHtml = fs.readFileSync(popupHtmlPath, 'utf8')
const popupJs = fs.readFileSync(popupJsPath, 'utf8')

describe('popup.js security validations', () => {
  let dom
  let window
  let document
  let syncSets = []
  let localSets = []

  beforeEach(() => {
    syncSets = []
    localSets = []

    dom = new JSDOM(popupHtml, {
      url: 'https://example.org/',
      runScripts: 'dangerously'
    })
    window = dom.window
    document = window.document

    // Mock chrome API
    window.chrome = {
      storage: {
        sync: {
          get: (_keys, cb) => cb({}),
          set: (data) => syncSets.push(data),
          remove: () => {}
        },
        local: {
          get: (_keys, cb) => cb({}),
          set: (data) => localSets.push(data)
        },
        onChanged: {
          addListener: () => {}
        }
      },
      runtime: {
        sendMessage: () => {}
      },
      tabs: {
        query: async () => [{ id: 1 }]
      }
    }

    // Execute the popup script in the context of our mock DOM
    const scriptEl = document.createElement('script')
    scriptEl.textContent = popupJs
    document.body.appendChild(scriptEl)
  })

  it('should not save ghToken to chrome.storage.sync when Start is clicked', async () => {
    // Wait for initial storage.get callbacks to resolve
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Set input values
    document.getElementById('ghOwner').value = 'testowner'
    document.getElementById('ghToken').value = 'super-secret-token'

    // Mock radio buttons which are required for startBtn click
    const modeDry = document.createElement('input')
    modeDry.type = 'radio'
    modeDry.name = 'mode'
    modeDry.value = 'dry'
    modeDry.checked = true
    document.body.appendChild(modeDry)

    const scopeCurrent = document.createElement('input')
    scopeCurrent.type = 'radio'
    scopeCurrent.name = 'scope'
    scopeCurrent.value = 'current'
    scopeCurrent.checked = true
    document.body.appendChild(scopeCurrent)

    // Clear tracking arrays before click
    syncSets.length = 0
    localSets.length = 0

    // Click start
    const startBtn = document.getElementById('startBtn')
    startBtn.click()

    // Allow async handlers to run
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify token is NOT in sync storage
    const syncHasToken = syncSets.some((data) => 'ghToken' in data)
    assert.strictEqual(syncHasToken, false, 'Security Vulnerability: ghToken was saved to chrome.storage.sync')

    // Verify token IS in local storage
    const localHasToken = localSets.some((data) => 'ghToken' in data && data.ghToken === 'super-secret-token')
    assert.strictEqual(localHasToken, true, 'ghToken should be saved to chrome.storage.local')

    // Verify owner IS in sync storage
    const syncHasOwner = syncSets.some((data) => 'ghOwner' in data && data.ghOwner === 'testowner')
    assert.strictEqual(syncHasOwner, true, 'ghOwner should be saved to chrome.storage.sync')
  })
})
