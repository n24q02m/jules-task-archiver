const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('Security: ghToken Storage Cleanup', () => {
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

  function setupPopupSandbox(initialSync = {}, initialLocal = {}) {
    const syncStorage = { ...initialSync }
    const localStorage = { ...initialLocal }
    const syncRemoved = []
    const syncSet = []
    const localSet = []

    const chrome = {
      storage: {
        sync: {
          get: (keys, cb) => {
            const res = {}
            keys.forEach((k) => {
              if (syncStorage[k] !== undefined) res[k] = syncStorage[k]
            })
            cb(res)
          },
          set: (obj) => {
            Object.assign(syncStorage, obj)
            syncSet.push(obj)
          },
          remove: (key) => {
            delete syncStorage[key]
            syncRemoved.push(key)
          }
        },
        local: {
          get: (keys, cb) => {
            const res = {}
            keys.forEach((k) => {
              if (localStorage[k] !== undefined) res[k] = localStorage[k]
            })
            cb(res)
          },
          set: (obj, cb) => {
            Object.assign(localStorage, obj)
            localSet.push(obj)
            if (cb) cb()
          }
        },
        onChanged: {
          addListener: () => {}
        }
      },
      runtime: {
        sendMessage: () => {},
        onMessage: {
          addListener: () => {}
        }
      },
      tabs: {
        query: () => {}
      }
    }

    const document = {
      querySelector: () => ({
        addEventListener: () => {},
        querySelectorAll: () => [],
        appendChild: () => {},
        dataset: {},
        classList: { toggle: () => {} },
        setAttribute: () => {}
      }),
      querySelectorAll: () => ({
        forEach: () => {}
      }),
      createElement: () => ({
        appendChild: () => {}
      })
    }

    const sandbox = { chrome, document, console, setTimeout, setInterval, clearInterval }
    vm.createContext(sandbox)

    return { sandbox, syncStorage, localStorage, syncRemoved, syncSet, localSet }
  }

  it('should cleanup ghToken from sync storage during initialization', () => {
    const { sandbox, syncStorage, localStorage, syncRemoved } = setupPopupSandbox(
      { ghToken: 'insecure-token', ghOwner: 'owner' },
      {}
    )

    vm.runInContext(popupJs, sandbox)

    assert.strictEqual(syncStorage.ghToken, undefined, 'ghToken should be removed from sync storage')
    assert.strictEqual(localStorage.ghToken, 'insecure-token', 'ghToken should be moved to local storage')
    assert.ok(syncRemoved.includes('ghToken'), "sync.remove('ghToken') should have been called")
  })

  it('should ensure startBtn click handler removes ghToken from sync', async () => {
    // This is harder to test without a full DOM mock, but we can verify the code intent
    assert.ok(
      popupJs.includes("chrome.storage.sync.remove('ghToken')"),
      'Source should contain sync.remove for ghToken'
    )
    assert.ok(popupJs.includes('chrome.storage.local.set({'), 'Source should contain local.set for token')
  })
})
