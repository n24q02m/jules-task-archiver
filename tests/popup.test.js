const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function setupPopupSandbox() {
  const elements = {}
  const document = {
    querySelector: (sel) => {
      if (!elements[sel]) {
        elements[sel] = {
          addEventListener: () => {},
          appendChild: function (child) {
            if (!this.children) this.children = []
            if (child.tag === 'fragment') {
              this.children.push(...(child.children || []))
            } else {
              this.children.push(child)
            }
          },
          style: {},
          textContent: '',
          classList: { toggle: () => {} },
          setAttribute: () => {},
          parentElement: { style: {} },
        }
      }
      return elements[sel]
    },
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tag,
      className: '',
      textContent: '',
      appendChild: function (child) {
        if (!this.children) this.children = []
        this.children.push(child)
      },
    }),
    createDocumentFragment: () => ({
      tag: 'fragment',
      children: [],
      appendChild: function (child) {
        this.children.push(child)
      },
    }),
  }

  const chrome = {
    storage: {
      sync: { get: (_keys, cb) => cb({}), set: () => {}, remove: () => {} },
      local: { get: (_keys, cb) => cb({}), set: () => {} },
      onChanged: { addListener: () => {} },
    },
    runtime: {
      sendMessage: (_msg, cb) => {
        if (cb) cb({})
      },
      onMessage: { addListener: () => {} },
    },
    tabs: { query: () => {} },
  }

  const sandbox = { chrome, document, console, setTimeout, setInterval, clearInterval }
  vm.createContext(sandbox)
  vm.runInContext(popupJs, sandbox)

  return { sandbox, elements, document }
}

describe('popup.js: renderSummary', () => {
  it('should render results correctly with DocumentFragment', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const results = [
      { label: 'repo1', count: 5 },
      { label: 'repo2', count: 3, err: 'failed' },
    ]

    sandbox.renderSummary(results)

    const summaryDiv = elements['#summary']
    assert.strictEqual(summaryDiv.children.length, 3) // 2 results + 1 total
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo1: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'repo2: ERROR - failed')
    assert.strictEqual(summaryDiv.children[1].className, 'error')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 8 processed')
    assert.strictEqual(summaryDiv.children[2].className, 'total')
  })
})
