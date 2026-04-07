const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJsPath = path.join(__dirname, '../popup.js')
const popupJsContent = fs.readFileSync(popupJsPath, 'utf8')

function createMockElement(id = '', tagName = 'div') {
  return {
    id,
    tagName: tagName.toUpperCase(),
    textContent: '',
    style: { display: '' },
    classList: {
      add: function (c) {
        this.classes.add(c)
      },
      remove: function (c) {
        this.classes.delete(c)
      },
      toggle: function (c, v) {
        v ? this.classes.add(c) : this.classes.delete(c)
      },
      contains: function (c) {
        return this.classes.has(c)
      },
      classes: new Set()
    },
    dataset: {},
    disabled: false,
    checked: false,
    value: '',
    children: [],
    appendChild: function (child) {
      this.children.push(child)
    },
    setAttribute: function (name, value) {
      this.attributes[name] = value
    },
    getAttribute: function (name) {
      return this.attributes[name]
    },
    attributes: {},
    addEventListener: () => {},
    parentElement: {
      style: { display: '' },
      setAttribute: function (name, value) {
        this.attributes[name] = value
      },
      attributes: {}
    }
  }
}

function setupPopupSandbox() {
  const elements = {
    '#ghOwner': createMockElement('ghOwner', 'input'),
    '#ghToken': createMockElement('ghToken', 'input'),
    '#force': createMockElement('force', 'input'),
    '#startBtn': createMockElement('startBtn', 'button'),
    '#resetBtn': createMockElement('resetBtn', 'button'),
    '#progressSection': createMockElement('progressSection'),
    '#summarySection': createMockElement('summarySection'),
    '#currentInfo': createMockElement('currentInfo'),
    '#progressFill': createMockElement('progressFill'),
    '#log': createMockElement('log', 'pre'),
    '#summary': createMockElement('summary'),
    '.settings': createMockElement('settings'),
    '#opMode button': []
  }

  const chrome = {
    storage: {
      sync: {
        get: (_keys, cb) => cb({}),
        set: (_obj, cb) => cb?.(),
        remove: (_keys, cb) => cb?.()
      },
      local: {
        get: (_keys, cb) => cb({}),
        set: (_obj, cb) => cb?.()
      },
      onChanged: {
        addListener: (cb) => {
          chrome.storage.onChanged.callback = cb
        }
      }
    },
    runtime: {
      sendMessage: (_msg, cb) => cb?.({ status: 'idle' })
    }
  }

  const document = {
    querySelector: (sel) => {
      if (sel === 'input[name="mode"]:checked') return { value: 'dry' }
      if (sel === 'input[name="scope"]:checked') return { value: 'all' }
      return elements[sel] || createMockElement()
    },
    querySelectorAll: (sel) => {
      if (sel === '#opMode button') return elements[sel]
      return { forEach: () => {} }
    },
    createElement: (tagName) => createMockElement('', tagName)
  }

  const sandbox = {
    chrome,
    document,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    Math
  }

  vm.createContext(sandbox)

  // Append exports to the script
  const scriptToRun =
    popupJsContent +
    `
    globalThis.test_renderState = renderState;
    globalThis.test_renderSummary = renderSummary;
    globalThis.test_elements = elements;
  `

  // We need to pass elements into the sandbox's globalThis so the appended script can see it
  sandbox.elements = elements

  vm.runInContext(scriptToRun, sandbox)

  return { sandbox, elements, chrome }
}

describe('popup.js: renderState', () => {
  it('should render log entries and show progress section', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      log: ['Line 1', 'Line 2'],
      status: 'idle'
    }

    sandbox.test_renderState(state)

    assert.strictEqual(elements['#log'].textContent, 'Line 1\nLine 2')
    assert.strictEqual(elements['#progressSection'].style.display, 'block')
  })

  it('should render running state with progress info', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'running',
      currentTab: 'Tab 1',
      currentRepo: 'Repo A',
      progress: { archived: 2, skipped: 1, total: 10 }
    }

    sandbox.test_renderState(state)

    assert.ok(elements['#currentInfo'].textContent.includes('Tab 1 > Repo A'))
    assert.ok(elements['#currentInfo'].textContent.includes('[3/10]'))
    assert.strictEqual(elements['#progressFill'].style.width, '30%')
    assert.strictEqual(elements['#progressFill'].parentElement.attributes['aria-valuenow'], '30')
  })

  it('should render done state and summary', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'done',
      results: [
        { label: 'Tab 1', count: 5 },
        { label: 'Tab 2', count: 3, err: 'Failed' }
      ]
    }

    sandbox.test_renderState(state)

    assert.strictEqual(elements['#startBtn'].disabled, false)
    assert.strictEqual(elements['#startBtn'].textContent, 'Start')
    assert.strictEqual(elements['#resetBtn'].style.display, 'block')
    assert.strictEqual(elements['#progressFill'].style.width, '100%')
    assert.strictEqual(elements['#currentInfo'].textContent, 'Complete')

    assert.strictEqual(elements['#summarySection'].style.display, 'block')
    assert.strictEqual(elements['#summary'].children.length, 3)
    assert.ok(elements['#summary'].children[0].textContent.includes('Tab 1: 5 processed'))
    assert.ok(elements['#summary'].children[1].textContent.includes('Tab 2: ERROR - Failed'))
    assert.strictEqual(elements['#summary'].children[1].className, 'error')
    assert.ok(elements['#summary'].children[2].textContent.includes('TOTAL: 8 processed'))
    assert.strictEqual(elements['#summary'].children[2].className, 'total')
  })

  it('should render error state', () => {
    const { sandbox, elements } = setupPopupSandbox()
    const state = {
      status: 'error',
      error: 'Something went wrong'
    }

    sandbox.test_renderState(state)

    assert.strictEqual(elements['#currentInfo'].textContent, 'Error: Something went wrong')
    assert.strictEqual(elements['#progressFill'].style.background, '#f87171')
    assert.strictEqual(elements['#startBtn'].disabled, false)
  })
})
