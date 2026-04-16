const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const popupScriptPath = path.join(__dirname, '..', 'popup.js')
const popupScriptContent = fs.readFileSync(popupScriptPath, 'utf8')

function setupEnvironment() {
  const elements = {}

  const createMockElement = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      classList: {
        _list: new Set(),
        add(c) {
          this._list.add(c)
        },
        remove(c) {
          this._list.delete(c)
        },
        toggle(c, val) {
          if (val === undefined) val = !this._list.has(c)
          if (val) this.add(c)
          else this.remove(c)
        },
        contains(c) {
          return this._list.has(c)
        }
      },
      _attributes: {},
      setAttribute(name, val) {
        this._attributes[name] = val
      },
      getAttribute(name) {
        return this._attributes[name]
      },
      addEventListener: () => {},
      appendChild(child) {
        if (!this.children) this.children = []
        this.children.push(child)
      },
      remove: () => {},
      textContent: '',
      parentElement: null,
      scrollTop: 0,
      scrollHeight: 100
    }
    return el
  }

  const docMock = {
    querySelector: (sel) => {
      if (sel === 'input[name="mode"]:checked') return { value: 'run' }
      if (sel === 'input[name="scope"]:checked') return { value: 'all' }

      let id = null
      if (sel.startsWith('#')) id = sel.slice(1)
      else if (sel === '.settings') id = 'settings'

      if (id) {
        if (!elements[id]) {
          elements[id] = createMockElement()
          elements[id].parentElement = createMockElement()
        }
        return elements[id]
      }
      return createMockElement()
    },
    querySelectorAll: (_sel) => {
      return []
    },
    createElement: (tag) => createMockElement(tag)
  }

  const chromeMock = {
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
        addListener: () => {}
      }
    },
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} }
    },
    tabs: {
      query: () => {}
    }
  }

  const sandbox = {
    document: docMock,
    window: { origin: 'chrome-extension://test' },
    chrome: chromeMock,
    console,
    Math,
    String,
    setTimeout,
    setInterval,
    clearInterval,
    Array,
    Object,
    JSON
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(popupScriptContent, sandbox)

  return { sandbox, elements }
}

describe('popup.js - renderState', () => {
  it('should handle null or undefined state gracefully', () => {
    const { sandbox } = setupEnvironment()
    assert.doesNotThrow(() => sandbox.renderState(null))
    assert.doesNotThrow(() => sandbox.renderState(undefined))
  })

  it('should update log display and scroll to bottom', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = {
      status: 'running',
      log: ['Line 1', 'Line 2']
    }
    elements.log.scrollHeight = 500

    sandbox.renderState(state)

    assert.strictEqual(elements.log.textContent, 'Line 1\nLine 2')
    assert.strictEqual(elements.log.scrollTop, 500)
    assert.strictEqual(elements.progressSection.style.display, 'block')
  })

  it('should update current info in running state with tab and repo', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = {
      status: 'running',
      currentTab: 'u/0',
      currentRepo: 'my-repo'
    }

    sandbox.renderState(state)

    assert.strictEqual(elements.currentInfo.textContent, 'u/0 > my-repo')
  })

  it('should update progress bar and current info with counts', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = {
      status: 'running',
      currentTab: 'u/0',
      progress: {
        archived: 3,
        skipped: 1,
        total: 10
      }
    }

    sandbox.renderState(state)

    // (3+1)/10 = 40%
    assert.strictEqual(elements.progressFill.style.width, '40%')
    assert.strictEqual(elements.progressFill.parentElement.getAttribute('aria-valuenow'), '40')
    assert.strictEqual(elements.currentInfo.textContent, 'u/0 [4/10]')
  })

  it('should handle done state with summary', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = {
      status: 'done',
      results: [{ label: 'Repo A', count: 5 }]
    }

    sandbox.renderState(state)

    assert.strictEqual(elements.startBtn.disabled, false)
    assert.strictEqual(elements.startBtn.textContent, 'Start')
    assert.strictEqual(elements.resetBtn.style.display, 'block')
    assert.strictEqual(elements.progressFill.style.width, '100%')
    assert.strictEqual(elements.currentInfo.textContent, 'Complete')
    assert.strictEqual(elements.summarySection.style.display, 'block')
  })

  it('should handle error state and change progress bar color', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = {
      status: 'error',
      error: 'API Error'
    }

    sandbox.renderState(state)

    assert.strictEqual(elements.startBtn.disabled, false)
    assert.strictEqual(elements.currentInfo.textContent, 'Error: API Error')
    assert.strictEqual(elements.progressFill.style.background, '#f87171')
    assert.strictEqual(elements.progressFill.style.width, '100%')
  })

  it('should handle idle state without UI changes', () => {
    const { sandbox, elements } = setupEnvironment()
    const state = { status: 'idle' }

    elements.startBtn.disabled = false
    elements.currentInfo.textContent = 'Initial'

    sandbox.renderState(state)

    assert.strictEqual(elements.startBtn.disabled, false)
    assert.strictEqual(elements.currentInfo.textContent, 'Initial')
  })
})

describe('popup.js - renderSummary', () => {
  it('should render success and error results and total count', () => {
    const { sandbox, elements } = setupEnvironment()
    const results = [
      { label: 'Repo A', count: 10 },
      { label: 'Repo B', count: 0, err: 'Unauthorized' }
    ]

    sandbox.renderSummary(results)

    assert.strictEqual(elements.summarySection.style.display, 'block')
    assert.strictEqual(elements.summary.children.length, 3)

    assert.strictEqual(elements.summary.children[0].textContent, 'Repo A: 10 processed')
    assert.strictEqual(elements.summary.children[1].textContent, 'Repo B: ERROR - Unauthorized')
    assert.strictEqual(elements.summary.children[1].className, 'error')
    assert.strictEqual(elements.summary.children[2].textContent, 'TOTAL: 10 processed')
    assert.strictEqual(elements.summary.children[2].className, 'total')
  })

  it('should handle empty or null results', () => {
    const { sandbox, elements } = setupEnvironment()
    elements.summarySection.style.display = 'none'

    sandbox.renderSummary([])
    assert.strictEqual(elements.summarySection.style.display, 'none')

    sandbox.renderSummary(null)
    assert.strictEqual(elements.summarySection.style.display, 'none')
  })
})
