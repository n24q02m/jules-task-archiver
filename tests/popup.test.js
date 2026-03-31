const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const popupHtmlPath = path.join(__dirname, '..', 'popup.html')
const popupJsPath = path.join(__dirname, '..', 'popup.js')

const popupHtmlContent = fs.readFileSync(popupHtmlPath, 'utf8')
const popupJsContent = fs.readFileSync(popupJsPath, 'utf8')

describe('popup.js UI state rendering', () => {
  let dom
  let window
  let document
  let chromeMock
  let storageChangedListeners

  beforeEach(() => {
    storageChangedListeners = []

    chromeMock = {
      storage: {
        sync: {
          get: (_keys, cb) => cb({}),
          set: () => {},
          remove: () => {}
        },
        local: {
          get: (_keys, cb) => cb({}),
          set: () => {}
        },
        onChanged: {
          addListener: (listener) => {
            storageChangedListeners.push(listener)
          }
        }
      },
      runtime: {
        sendMessage: (msg, cb) => {
          if (msg.action === 'GET_STATE' && cb) {
            cb({ status: 'idle' })
          }
        }
      }
    }

    // Initialize JSDOM with our HTML
    dom = new JSDOM(popupHtmlContent, {
      url: 'http://localhost/',
      runScripts: 'dangerously'
    })
    window = dom.window
    document = window.document

    // Inject chrome mock into the JSDOM window
    window.chrome = chromeMock

    // Execute the popup.js script in the JSDOM context
    const scriptEl = document.createElement('script')
    scriptEl.textContent = popupJsContent
    document.body.appendChild(scriptEl)
  })

  afterEach(() => {
    window.close()
  })

  it('should render running state correctly via storage.onChanged', () => {
    const $ = (sel) => document.querySelector(sel)

    // Fire storage.onChanged listener with a 'running' state
    const runningState = {
      status: 'running',
      currentTab: 'u/0',
      currentRepo: 'my-org/my-repo',
      progress: { archived: 5, skipped: 2, total: 10 },
      log: ['Started archiving...', 'Processing u/0...']
    }

    for (const listener of storageChangedListeners) {
      listener(
        {
          archiveState: { newValue: runningState }
        },
        'session'
      )
    }

    // Check UI elements
    assert.strictEqual($('#log').textContent, 'Started archiving...\nProcessing u/0...')
    assert.strictEqual($('#progressSection').style.display, 'block')

    // progress is (5+2)/10 = 70%
    assert.strictEqual($('#progressFill').style.width, '70%')

    assert.strictEqual($('#currentInfo').textContent, 'u/0 > my-org/my-repo [7/10]')
  })

  it('should render done state and summary correctly', () => {
    const $ = (sel) => document.querySelector(sel)

    const doneState = {
      status: 'done',
      results: [
        { label: 'my-org/repo1', count: 5 },
        { label: 'my-org/repo2', count: 0, err: 'Failed to click' }
      ]
    }

    for (const listener of storageChangedListeners) {
      listener(
        {
          archiveState: { newValue: doneState }
        },
        'session'
      )
    }

    assert.strictEqual($('#startBtn').disabled, false)
    assert.strictEqual($('#startBtn').textContent, 'Start')
    assert.strictEqual($('#resetBtn').style.display, 'block')
    assert.strictEqual($('#progressFill').style.width, '100%')
    assert.strictEqual($('#currentInfo').textContent, 'Complete')

    assert.strictEqual($('#summarySection').style.display, 'block')
    const summaryChildren = $('#summary').children
    assert.strictEqual(summaryChildren.length, 3) // 2 results + 1 total
    assert.strictEqual(summaryChildren[0].textContent, 'my-org/repo1: 5 archived')
    assert.strictEqual(summaryChildren[1].className, 'error')
    assert.strictEqual(summaryChildren[1].textContent, 'my-org/repo2: ERROR - Failed to click')
    assert.strictEqual(summaryChildren[2].className, 'total')
    assert.strictEqual(summaryChildren[2].textContent, 'TOTAL: 5 tasks archived')
  })

  it('should render error state correctly', () => {
    const $ = (sel) => document.querySelector(sel)

    const errorState = {
      status: 'error',
      error: 'Network timeout'
    }

    for (const listener of storageChangedListeners) {
      listener(
        {
          archiveState: { newValue: errorState }
        },
        'session'
      )
    }

    assert.strictEqual($('#startBtn').disabled, false)
    assert.strictEqual($('#startBtn').textContent, 'Start')
    assert.strictEqual($('#resetBtn').style.display, 'block')
    assert.strictEqual($('#progressFill').style.width, '100%')
    assert.strictEqual($('#progressFill').style.background, 'rgb(248, 113, 113)') // #f87171 parsed by jsdom
    assert.strictEqual($('#currentInfo').textContent, 'Error: Network timeout')
  })

  it('should ignore storage.onChanged events not from session area or missing archiveState', () => {
    const $ = (sel) => document.querySelector(sel)
    const initialLogText = $('#log').textContent

    // Missing archiveState
    for (const listener of storageChangedListeners) {
      listener({ someOtherKey: { newValue: 'foo' } }, 'session')
    }
    assert.strictEqual($('#log').textContent, initialLogText)

    // Not session area
    for (const listener of storageChangedListeners) {
      listener({ archiveState: { newValue: { status: 'running', log: ['bad'] } } }, 'local')
    }
    assert.strictEqual($('#log').textContent, initialLogText)

    // archiveState is undefined/falsy
    for (const listener of storageChangedListeners) {
      listener({ archiveState: { newValue: null } }, 'session')
    }
    assert.strictEqual($('#log').textContent, initialLogText)
  })
})
