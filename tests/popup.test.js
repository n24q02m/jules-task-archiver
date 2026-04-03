const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8')
const popupJs = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8')

describe('popup.js UI rendering', () => {
  let dom
  let window
  let document
  let chrome

  beforeEach(() => {
    // Mock chrome API
    chrome = {
      storage: {
        sync: {
          get: (_keys, cb) => cb({}),
          set: () => {}
        },
        local: {
          get: (_keys, cb) => cb({}),
          set: () => {}
        },
        onChanged: {
          addListener: () => {}
        }
      },
      runtime: {
        sendMessage: (msg, cb) => {
          if (msg.action === 'GET_STATE' && cb) cb({ status: 'idle' })
        }
      },
      tabs: {
        query: () => []
      }
    }

    dom = new JSDOM(popupHtml, {
      runScripts: 'dangerously',
      resources: 'usable'
    })
    window = dom.window
    document = window.document
    window.chrome = chrome

    // Manually execute popupJs in the JSDOM context
    const scriptTag = document.createElement('script')
    scriptTag.textContent = popupJs
    document.body.appendChild(scriptTag)
  })

  it('should show progress section when state is running', () => {
    const state = {
      status: 'running',
      currentTab: 'u/0',
      currentRepo: 'owner/repo',
      log: ['Starting...'],
      progress: { archived: 1, skipped: 0, total: 2 }
    }

    window.renderState(state)

    const progressSection = document.getElementById('progressSection')
    const currentInfo = document.getElementById('currentInfo')
    const progressFill = document.getElementById('progressFill')
    const log = document.getElementById('log')

    assert.strictEqual(progressSection.style.display, 'block')
    assert.ok(currentInfo.textContent.includes('u/0 > owner/repo'))
    assert.ok(currentInfo.textContent.includes('[1/2]'))
    assert.strictEqual(progressFill.style.width, '50%')
    assert.strictEqual(log.textContent, 'Starting...')
  })

  it('should show summary and reset button when state is done', () => {
    const state = {
      status: 'done',
      results: [
        { label: 'repo1', count: 5 },
        { label: 'repo2', count: 3, err: 'failed' }
      ]
    }

    window.renderState(state)

    const summarySection = document.getElementById('summarySection')
    const summary = document.getElementById('summary')
    const resetBtn = document.getElementById('resetBtn')
    const startBtn = document.getElementById('startBtn')

    assert.strictEqual(summarySection.style.display, 'block')
    assert.strictEqual(resetBtn.style.display, 'block')
    assert.strictEqual(startBtn.disabled, false)
    assert.ok(summary.textContent.includes('repo1: 5 processed'))
    assert.ok(summary.textContent.includes('repo2: ERROR - failed'))
    assert.ok(summary.textContent.includes('TOTAL: 8 processed'))
  })

  it('should show error message and red progress bar when state is error', () => {
    const state = {
      status: 'error',
      error: 'Something went wrong'
    }

    window.renderState(state)

    const currentInfo = document.getElementById('currentInfo')
    const progressFill = document.getElementById('progressFill')

    assert.strictEqual(currentInfo.textContent, 'Error: Something went wrong')
    assert.strictEqual(progressFill.style.background, 'rgb(248, 113, 113)') // hex #f87171
  })

  it('should hide progress and summary when reset is clicked', () => {
    // Simulate initial "done" state
    window.renderState({ status: 'done', results: [] })

    const resetBtn = document.getElementById('resetBtn')
    const progressSection = document.getElementById('progressSection')
    const summarySection = document.getElementById('summarySection')

    // Simulate click
    resetBtn.click()

    assert.strictEqual(progressSection.style.display, 'none')
    assert.strictEqual(summarySection.style.display, 'none')
    assert.strictEqual(resetBtn.style.display, 'none')
  })
})
