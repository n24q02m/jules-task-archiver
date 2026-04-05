const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function setupPopupSandbox() {
  const elements = {}
  const createMockElement = (tag = 'div', hasParent = true) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        add: function (c) {
          const current = (this.className || '').split(' ').filter((x) => x)
          if (!current.includes(c)) current.push(c)
          this.className = current.join(' ')
        },
        remove: function (c) {
          const current = (this.className || '').split(' ').filter((x) => x)
          this.className = current.filter((x) => x !== c).join(' ')
        },
        toggle: function (c, force) {
          if (force === undefined) force = !this.classList.contains(c)
          if (force) this.classList.add(c)
          else this.classList.remove(c)
        },
        contains: function (c) {
          return (this.className || '').split(' ').includes(c)
        }
      },
      dataset: {},
      appendChild: function (child) {
        this.children = this.children || []
        this.children.push(child)
      },
      addEventListener: () => {},
      setAttribute: function (name, val) {
        this[name] = val
      },
      getAttribute: function (name) {
        return this[name]
      },
      textContent: '',
      innerHTML: '',
      value: '',
      scrollHeight: 100,
      scrollTop: 0
    }
    if (hasParent) {
      el.parentElement = createMockElement('div', false)
    }
    return el
  }

  const document = {
    querySelector: (sel) => {
      if (!elements[sel]) elements[sel] = createMockElement()
      return elements[sel]
    },
    querySelectorAll: (_sel) => {
      return { forEach: () => {} }
    },
    createElement: (tag) => createMockElement(tag)
  }

  const chrome = {
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
      session: {
        get: (_keys, cb) => cb({}),
        set: () => {}
      },
      onChanged: {
        addListener: (fn) => {
          chrome.storage.onChanged.listener = fn
        }
      }
    },
    runtime: {
      sendMessage: (_msg, cb) => {
        if (cb) cb()
      },
      onMessage: { addListener: () => {} }
    },
    tabs: {
      query: () => []
    }
  }

  const sandbox = {
    chrome,
    document,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    URL,
    globalThis: {}
  }
  vm.createContext(sandbox)

  // Directly export the functions by assigning them to globalThis inside the script
  const scriptToRun =
    popupJs +
    `
    globalThis.renderState = renderState;
    globalThis.renderSummary = renderSummary;
    globalThis.setActiveOpMode = setActiveOpMode;
  `

  vm.runInContext(scriptToRun, sandbox)

  return { sandbox, elements, chrome }
}

describe('popup.js renderState', () => {
  it('should render log entries', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      log: ['Line 1', 'Line 2']
    }
    sandbox.renderState(state)
    assert.strictEqual(elements['#log'].textContent, 'Line 1\nLine 2')
    assert.strictEqual(elements['#progressSection'].style.display, 'block')
  })

  it('should render running state with progress', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'running',
      currentTab: 'u/1',
      currentRepo: 'owner/repo',
      progress: { archived: 2, skipped: 1, total: 10 }
    }
    sandbox.renderState(state)
    assert.ok(elements['#currentInfo'].textContent.includes('u/1 > owner/repo'))
    assert.ok(elements['#currentInfo'].textContent.includes('[3/10]'))
    assert.strictEqual(elements['#progressFill'].style.width, '30%')
  })

  it('should render done state with summary', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'done',
      results: [
        { label: 'repo1', count: 5 },
        { label: 'repo2', count: 3, err: 'Some error' }
      ]
    }
    sandbox.renderState(state)
    assert.strictEqual(elements['#currentInfo'].textContent, 'Complete')
    assert.strictEqual(elements['#progressFill'].style.width, '100%')
    assert.strictEqual(elements['#summarySection'].style.display, 'block')

    const summaryDiv = elements['#summary']
    assert.strictEqual(summaryDiv.children.length, 3) // 2 repos + 1 total
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'repo2: ERROR - Some error')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 8 processed')
  })

  it('should render error state', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'error',
      error: 'Fatal crash'
    }
    sandbox.renderState(state)
    assert.strictEqual(elements['#currentInfo'].textContent, 'Error: Fatal crash')
    assert.strictEqual(elements['#progressFill'].style.background, '#f87171')
  })
})

describe('popup.js storage listener', () => {
  it('should react to session storage changes for archiveState', () => {
    const { elements, chrome } = setupPopupSandbox()
    const changes = {
      archiveState: { newValue: { log: ['New update'] } }
    }
    chrome.storage.onChanged.listener(changes, 'session')
    assert.strictEqual(elements['#log'].textContent, 'New update')
  })

  it('should ignore non-session storage changes', () => {
    const { elements, chrome } = setupPopupSandbox()
    const changes = {
      archiveState: { newValue: { log: ['Should ignore'] } }
    }
    chrome.storage.onChanged.listener(changes, 'sync')
    assert.notStrictEqual(elements['#log'].textContent, 'Should ignore')
  })
})
