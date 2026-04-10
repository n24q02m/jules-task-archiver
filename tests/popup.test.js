const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function setupPopupSandbox() {
  const elements = {}

  const createElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        classes: new Set(),
        toggle(cls, val) {
          if (val === undefined) val = !this.classes.has(cls)
          if (val) this.add(cls)
          else this.remove(cls)
        },
        add(cls) {
          this.classes.add(cls)
          el.className = Array.from(this.classes).join(' ')
        },
        remove(cls) {
          this.classes.delete(cls)
          el.className = Array.from(this.classes).join(' ')
        },
        contains(cls) {
          return this.classes.has(cls)
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
      _textContent: '',
      get textContent() {
        return this._textContent
      },
      set textContent(val) {
        this._textContent = val
        if (val === '') this.children = []
      }
    }
    return el
  }

  const document = {
    querySelector: (sel) => {
      if (elements[sel]) return elements[sel]
      elements[sel] = createElement('div')
      return elements[sel]
    },
    querySelectorAll: () => ({
      forEach: () => {}
    }),
    createElement
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
        set: (_obj, cb) => cb?.()
      },
      onChanged: {
        addListener: () => {}
      }
    },
    runtime: {
      sendMessage: (_msg, cb) => cb?.({ status: 'idle' }),
      onMessage: {
        addListener: () => {}
      }
    },
    tabs: {
      query: () => []
    }
  }

  const sandbox = {
    document,
    chrome,
    console,
    setTimeout,
    setInterval,
    clearInterval
  }
  vm.createContext(sandbox)

  // Need to define $ and other things before running the script if they are used top-level
  // But they are defined IN the script.

  vm.runInContext(popupJs, sandbox)

  return { sandbox, elements }
}

describe('renderSummary', () => {
  it('should return early if results is empty or null', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summarySection = elements['#summarySection']

    // Initially hidden or whatever the script sets it to.
    // Let's call it.
    sandbox.renderSummary(null)
    assert.notStrictEqual(summarySection.style.display, 'block')

    sandbox.renderSummary([])
    assert.notStrictEqual(summarySection.style.display, 'block')
  })

  it('should render successful results and total', () => {
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

  it('should render error results', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    const results = [
      { label: 'repo1', count: 5 },
      { label: 'repo2', count: 0, err: 'Failed to fetch' }
    ]

    sandbox.renderSummary(results)

    assert.strictEqual(summaryDiv.children.length, 3)
    assert.strictEqual(summaryDiv.children[1].textContent, 'repo2: ERROR - Failed to fetch')
    assert.strictEqual(summaryDiv.children[1].className, 'error')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 5 processed')
  })

  it('should clear previous summary content before rendering', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const summaryDiv = elements['#summary']

    sandbox.renderSummary([{ label: 'repo1', count: 1 }])
    assert.strictEqual(summaryDiv.children.length, 2)

    sandbox.renderSummary([{ label: 'repo2', count: 2 }])
    assert.strictEqual(summaryDiv.children.length, 2)
    assert.strictEqual(summaryDiv.children[0].textContent, 'repo2: 2 processed')
  })
})
