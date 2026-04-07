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
      style: {},
      classList: {
        add: (cls) => {
          if (!el.className) {
            el.className = cls
          } else {
            el.className += ` ${cls}`
          }
        },
        toggle: (_cls, _val) => {
          /* simple mock */
        }
      },
      setAttribute: (name, val) => {
        el[name] = val
      },
      appendChild: (child) => {
        el.children = el.children || []
        el.children.push(child)
      },
      addEventListener: () => {},
      dataset: {},
      parentElement: { style: {} }
    }
    Object.defineProperty(el, 'textContent', {
      set: (val) => {
        el._textContent = val
        if (val === '') el.children = []
      },
      get: () => el._textContent
    })
    return el
  }

  const querySelector = (sel) => {
    if (elements[sel]) return elements[sel]
    const el = createElement('div')
    elements[sel] = el
    return el
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
        set: (_obj, cb) => cb?.()
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
      querySelectorAll: () => ({ forEach: () => {} }),
      createElement
    },
    chrome: chromeMock,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    Math,
    Object,
    Array,
    String
  }

  vm.createContext(sandbox)
  vm.runInContext(popupJsContent, sandbox)

  return { sandbox, elements }
}

describe('popup.js: renderSummary', () => {
  it('should not show summarySection if results is empty', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summarySection = elements['#summarySection']
    summarySection.style.display = 'none'

    sandbox.renderSummary([])
    assert.strictEqual(summarySection.style.display, 'none')

    sandbox.renderSummary(null)
    assert.strictEqual(summarySection.style.display, 'none')
  })

  it('should render success results correctly', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summarySection = elements['#summarySection']
    const summaryDiv = elements['#summary']

    const results = [
      { label: 'repo1', count: 5 },
      { label: 'repo2', count: 3 }
    ]

    sandbox.renderSummary(results)

    assert.strictEqual(summarySection.style.display, 'block')
    assert.strictEqual(summaryDiv.children.length, 3) // 2 repos + 1 total

    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'repo2: 3 processed')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 8 processed')
    assert.strictEqual(summaryDiv.children[2].className, 'total')
  })

  it('should render error results correctly', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    const results = [{ label: 'repo1', count: 0, err: 'API error' }]

    sandbox.renderSummary(results)

    assert.strictEqual(summaryDiv.children.length, 2) // 1 repo + 1 total
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: ERROR - API error')
    assert.strictEqual(summaryDiv.children[0].className, 'error')
    assert.strictEqual(summaryDiv.children[1].textContent, 'TOTAL: 0 processed')
  })

  it('should clear previous results before rendering new ones', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    sandbox.renderSummary([{ label: 'first', count: 1 }])
    assert.strictEqual(summaryDiv.children.length, 2)

    sandbox.renderSummary([{ label: 'second', count: 2 }])
    assert.strictEqual(summaryDiv.children.length, 2)
    assert.strictEqual(summaryDiv.children[0].textContent, 'second: 2 processed')
  })
})
