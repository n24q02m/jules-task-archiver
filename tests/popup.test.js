const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8')
const scriptContent = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8')

describe('popup.js UI rendering', () => {
  let dom
  let window
  let document
  let chromeMock
  let storageListeners = []

  beforeEach(() => {
    storageListeners = []
    chromeMock = {
      storage: {
        sync: {
          get: (_keys, cb) => cb({}),
          set: (_data, cb) => cb?.()
        },
        local: {
          get: (_keys, cb) => cb({}),
          set: (_data, cb) => cb?.()
        },
        onChanged: {
          addListener: (fn) => storageListeners.push(fn)
        }
      },
      runtime: {
        sendMessage: (_msg, cb) => cb?.(null)
      },
      tabs: {
        query: async () => [{ id: 123 }]
      }
    }

    dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' })
    window = dom.window
    document = window.document
    window.chrome = chromeMock

    // Execute popup.js in the jsdom context
    const script = document.createElement('script')
    script.textContent = scriptContent
    document.body.appendChild(script)
  })

  it('should update log and show progress section when state has log', () => {
    const logPre = document.getElementById('log')
    const progressSection = document.getElementById('progressSection')

    const newState = {
      log: ['Line 1', 'Line 2'],
      status: 'running'
    }

    // Simulate storage change
    for (const fn of storageListeners) {
      fn({ archiveState: { newValue: newState } }, 'session')
    }

    assert.strictEqual(logPre.textContent, 'Line 1\nLine 2')
    assert.strictEqual(progressSection.style.display, 'block')
  })

  it('should update progress bar and current info during running state', () => {
    const progressFill = document.getElementById('progressFill')
    const currentInfo = document.getElementById('currentInfo')

    const newState = {
      status: 'running',
      currentRepo: 'owner/repo',
      progress: { archived: 2, skipped: 1, total: 10 },
      log: ['Working...']
    }

    for (const fn of storageListeners) {
      fn({ archiveState: { newValue: newState } }, 'session')
    }

    // (2+1)/10 = 30%
    assert.strictEqual(progressFill.style.width, '30%')
    assert.ok(currentInfo.textContent.includes('owner/repo'))
    assert.ok(currentInfo.textContent.includes('[3/10]'))
  })

  it('should show summary and reset button when status is done', () => {
    const startBtn = document.getElementById('startBtn')
    const resetBtn = document.getElementById('resetBtn')
    const summarySection = document.getElementById('summarySection')
    const summaryDiv = document.getElementById('summary')

    const newState = {
      status: 'done',
      results: [
        { label: 'Repo A', count: 5 },
        { label: 'Repo B', count: 3, err: 'Failed some' }
      ],
      log: ['Done.']
    }

    for (const fn of storageListeners) {
      fn({ archiveState: { newValue: newState } }, 'session')
    }

    assert.strictEqual(startBtn.disabled, false)
    assert.strictEqual(resetBtn.style.display, 'block')
    assert.strictEqual(summarySection.style.display, 'block')

    // Check summary content
    const summaryText = summaryDiv.textContent
    assert.ok(summaryText.includes('Repo A: 5 processed'))
    assert.ok(summaryText.includes('Repo B: ERROR - Failed some'))
    assert.ok(summaryText.includes('TOTAL: 8 processed'))
  })

  it('should show error message and red progress bar on error', () => {
    const currentInfo = document.getElementById('currentInfo')
    const progressFill = document.getElementById('progressFill')

    const newState = {
      status: 'error',
      error: 'Something went wrong',
      log: ['Error occurred']
    }

    for (const fn of storageListeners) {
      fn({ archiveState: { newValue: newState } }, 'session')
    }

    assert.ok(currentInfo.textContent.includes('Error: Something went wrong'))
    // #f87171 is the red color used in the code
    assert.strictEqual(progressFill.style.background, 'rgb(248, 113, 113)')
  })

  it('should ignore changes not in session area', () => {
    const logPre = document.getElementById('log')
    logPre.textContent = 'Initial'

    const newState = {
      log: ['Should not be updated'],
      status: 'running'
    }

    // Simulate change in 'sync' area
    for (const fn of storageListeners) {
      fn({ archiveState: { newValue: newState } }, 'sync')
    }

    assert.strictEqual(logPre.textContent, 'Initial')
  })
})
