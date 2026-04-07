const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJsPath = path.join(__dirname, '..', 'popup.js')
const popupJsContent = fs.readFileSync(popupJsPath, 'utf8')

function setupPopupSandbox() {
  const elements = {}

  const createElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: { display: 'none' },
      classList: {
        add: function (cls) {
          const current = (this.className || '').split(' ').filter(Boolean)
          if (!current.includes(cls)) {
            current.push(cls)
            this.className = current.join(' ')
          }
        },
        toggle: () => {},
        remove: () => {}
      },
      setAttribute: function (name, value) {
        this[name] = value
      },
      children: [],
      appendChild: function (child) {
        this.children.push(child)
      },
      addEventListener: () => {},
      dataset: {},
      _textContent: '',
      get textContent() {
        return this._textContent
      },
      set textContent(val) {
        this._textContent = val
        if (val === '') {
          this.children = []
        }
      },
      parentElement: {
        style: {}
      }
    }
    return el
  }

  const querySelector = (sel) => {
    if (!elements[sel]) {
      elements[sel] = createElement('div')
    }
    return elements[sel]
  }

  const chromeMock = {
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
      sendMessage: () => {},
      onMessage: {
        addListener: () => {}
      }
    },
    tabs: {
      query: () => {}
    }
  }

  const sandbox = {
    document: {
      querySelector,
      querySelectorAll: () => ({
        forEach: () => {}
      }),
      createElement
    },
    chrome: chromeMock,
    console,
    setTimeout,
    setInterval,
    URL
  }

  vm.createContext(sandbox)

  // We need to capture the functions defined in popup.js
  vm.runInContext(popupJsContent, sandbox)

  return { sandbox, elements }
}

describe('popup.js: renderSummary', () => {
  it('should do nothing if results are empty', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summarySection = elements['#summarySection']

    // Initial state
    summarySection.style.display = 'none'

    sandbox.renderSummary([])
    assert.strictEqual(summarySection.style.display, 'none')

    sandbox.renderSummary(null)
    assert.strictEqual(summarySection.style.display, 'none')
  })

  it('should render successful results and total', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summarySection = elements['#summarySection']
    const summaryDiv = elements['#summary']

    const results = [
      { label: 'repo1', count: 5 },
      { label: 'repo2', count: 10 }
    ]

    sandbox.renderSummary(results)

    assert.strictEqual(summarySection.style.display, 'block')
    assert.strictEqual(summaryDiv.children.length, 3) // repo1, repo2, and total

    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'repo2: 10 processed')
    assert.strictEqual(summaryDiv.children[2].className, 'total')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 15 processed')
  })

  it('should render error results', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    const results = [{ label: 'repo1', count: 0, err: 'API Limit' }]

    sandbox.renderSummary(results)

    assert.strictEqual(summaryDiv.children.length, 2) // repo1 (err), and total
    assert.ok(summaryDiv.children[0].className.includes('error'))
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: ERROR - API Limit')
    assert.strictEqual(summaryDiv.children[1].textContent, 'TOTAL: 0 processed')
  })

  it('should clear previous summary before rendering new one', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    sandbox.renderSummary([{ label: 'repo1', count: 5 }])
    assert.strictEqual(summaryDiv.children.length, 2)

    sandbox.renderSummary([{ label: 'repo2', count: 10 }])
    assert.strictEqual(summaryDiv.children.length, 2)
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo2: 10 processed')
  })
})
