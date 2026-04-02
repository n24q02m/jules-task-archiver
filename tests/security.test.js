const { test, describe } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const { JSDOM } = require('jsdom')

describe('Security: ghToken Storage', () => {
  test('ghToken should never be saved to sync storage in popup.js', async () => {
    const html = fs.readFileSync('popup.html', 'utf8')
    const js = fs.readFileSync('popup.js', 'utf8')

    let syncSetCalledWith = null
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.chrome = {
          storage: {
            sync: {
              get: (_keys, cb) => {
                if (cb) setTimeout(() => cb({}), 0)
              },
              set: (data, cb) => {
                syncSetCalledWith = data
                if (cb) setTimeout(cb, 0)
              },
              remove: (_keys, cb) => {
                if (cb) setTimeout(cb, 0)
              }
            },
            local: {
              get: (_keys, cb) => {
                if (cb) setTimeout(() => cb({}), 0)
              },
              set: (_data, cb) => {
                if (cb) setTimeout(cb, 0)
              }
            },
            session: {
              get: (_keys) => Promise.resolve({}),
              set: (_data) => Promise.resolve()
            },
            onChanged: {
              addListener: () => {}
            }
          },
          runtime: {
            sendMessage: (_msg, cb) => {
              if (cb) setTimeout(() => cb(null), 0)
            },
            onMessage: {
              addListener: () => {}
            }
          },
          tabs: {
            query: () => Promise.resolve([{ id: 123 }])
          },
          scripting: {
            executeScript: () => Promise.resolve()
          }
        }
        // Mock document.querySelector for radio buttons if needed, but they are in HTML
      }
    })

    const { window } = dom

    // Manually execute the script in the window context
    const scriptEl = window.document.createElement('script')
    scriptEl.textContent = js
    window.document.body.appendChild(scriptEl)

    // Wait for any async initialization
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Find token input and start button
    const ghTokenInput = window.document.getElementById('ghToken')
    const startBtn = window.document.getElementById('startBtn')

    assert.ok(ghTokenInput, 'ghToken input found')
    assert.ok(startBtn, 'startBtn found')

    ghTokenInput.value = 'ghp_test_token_123'

    // Simulate click
    startBtn.click()

    // Wait for click handler (it is async)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify sync storage call
    assert.ok(syncSetCalledWith, 'chrome.storage.sync.set should have been called')
    assert.strictEqual(syncSetCalledWith.ghToken, undefined, 'ghToken should NOT be in sync storage')
    assert.ok(syncSetCalledWith.ghOwner !== undefined, 'ghOwner should be in sync storage')
  })

  test('background.js should not attempt to migrate ghToken from sync storage', async () => {
    const js = fs.readFileSync('background.js', 'utf8')
    assert.ok(!js.includes('await chrome.storage.sync.get(["ghToken"])'), 'Migration code should be removed')
    assert.ok(!js.includes("await chrome.storage.sync.get(['ghToken'])"), 'Migration code should be removed')
  })
})
