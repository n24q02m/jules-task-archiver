const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function setupPopupSandbox() {
  const syncStorage = {}
  const localStorage = {}
  const sessionStorage = {}
  const listeners = {
    storage: [],
    runtime: []
  }

  const createMockElement = (tag = 'div', attrs = {}) => {
    const element = {
      tagName: tag.toUpperCase(),
      attributes: { ...attrs },
      dataset: attrs.dataset || {},
      classList: {
        classes: new Set(),
        toggle: (cls, val) => {
          if (val === undefined) {
            if (element.classList.classes.has(cls)) element.classList.classes.delete(cls)
            else element.classList.classes.add(cls)
          } else if (val) {
            element.classList.classes.add(cls)
          } else {
            element.classList.classes.delete(cls)
          }
        },
        add: (cls) => element.classList.classes.add(cls),
        contains: (cls) => element.classList.classes.has(cls)
      },
      setAttribute: (name, val) => {
        element.attributes[name] = val
      },
      getAttribute: (name) => element.attributes[name],
      removeAttribute: (name) => {
        delete element.attributes[name]
      },
      addEventListener: (type, cb) => {
        if (!element.listeners) element.listeners = {}
        if (!element.listeners[type]) element.listeners[type] = []
        element.listeners[type].push(cb)
      },
      dispatchEvent: (type) => {
        if (element.listeners?.[type]) {
          element.listeners[type].forEach((cb) => {
            cb({ target: element })
          })
        }
      },
      style: { display: '' },
      appendChild: (child) => {
        if (!element.children) element.children = []
        if (child.nodeType === 11) {
          // DocumentFragment
          child.children.forEach((c) => {
            element.children.push(c)
            c.parentElement = element
          })
          child.children = [] // Clear fragment
        } else {
          element.children.push(child)
          child.parentElement = element
        }
      },
      remove: () => {
        if (element.parentElement?.children) {
          element.parentElement.children = element.parentElement.children.filter((c) => c !== element)
        }
      },
      querySelectorAll: (_sel) => [],
      querySelector: (_sel) => null,
      focus: () => {
        element.focused = true
      },
      textContent: '',
      value: '',
      checked: false,
      disabled: false,
      focused: false,
      scrollHeight: 0,
      scrollTop: 0
    }
    return element
  }

  const elements = {
    '#ghOwner': createMockElement('input'),
    '#ghToken': createMockElement('input'),
    '#force': createMockElement('input', { type: 'checkbox' }),
    '#startBtn': createMockElement('button'),
    'input[name="mode"]:checked': createMockElement('input', { value: 'dry' }),
    '#resetBtn': createMockElement('button'),
    '#progressSection': createMockElement('section'),
    '#summarySection': createMockElement('section'),
    '#currentInfo': createMockElement('div'),
    '#progressFill': createMockElement('div'),
    '#log': createMockElement('pre'),
    '#summary': createMockElement('div'),
    '.settings': createMockElement('section')
  }

  // Parent element for elements that use .parentElement in popup.js
  elements['#force'].parentElement = createMockElement('div')
  elements['#progressFill'].parentElement = createMockElement('div')

  const opModeButtons = [
    createMockElement('button', { dataset: { value: 'archive' } }),
    createMockElement('button', { dataset: { value: 'suggestions' } })
  ]

  const document = {
    querySelector: (sel) => {
      if (sel === 'input[name="mode"]:checked') return { value: 'dry' }
      if (sel === 'input[name="scope"]:checked') return { value: 'all' }
      if (elements[sel]) return elements[sel]
      return createMockElement()
    },
    querySelectorAll: (sel) => {
      if (sel === '#opMode button') {
        return {
          forEach: (cb) => opModeButtons.forEach(cb)
        }
      }
      return { forEach: () => {} }
    },
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => {
      const frag = createMockElement('documentfragment')
      frag.nodeType = 11
      return frag
    }
  }

  const chrome = {
    storage: {
      sync: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (syncStorage[k] !== undefined) res[k] = syncStorage[k]
          })
          cb(res)
        },
        set: (obj, cb) => {
          Object.assign(syncStorage, obj)
          if (cb) cb()
        },
        remove: (key, cb) => {
          delete syncStorage[key]
          if (cb) cb()
        }
      },
      local: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (localStorage[k] !== undefined) res[k] = localStorage[k]
          })
          cb(res)
        },
        set: (obj, cb) => {
          Object.assign(localStorage, obj)
          if (cb) cb()
        }
      },
      session: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (sessionStorage[k] !== undefined) res[k] = sessionStorage[k]
          })
          cb(res)
        }
      },
      onChanged: {
        addListener: (cb) => listeners.storage.push(cb)
      }
    },
    runtime: {
      sendMessage: (msg, cb) => {
        if (cb) {
          if (msg.action === 'GET_STATE') cb({ status: 'idle' })
          else cb()
        }
      },
      onMessage: {
        addListener: (cb) => listeners.runtime.push(cb)
      }
    },
    tabs: {
      query: (_opts) => Promise.resolve([{ id: 123 }])
    }
  }

  const sandbox = {
    chrome,
    document,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    Math,
    String,
    Array,
    Object
  }
  vm.createContext(sandbox)

  return { sandbox, elements, opModeButtons, syncStorage, localStorage, listeners }
}

describe('setActiveOpMode', () => {
  it('should toggle active class and aria-pressed on buttons', () => {
    const { sandbox, opModeButtons } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    sandbox.setActiveOpMode('suggestions')

    assert.ok(opModeButtons[1].classList.contains('active'), 'Suggestions button should be active')
    assert.strictEqual(opModeButtons[1].getAttribute('aria-pressed'), 'true')

    assert.ok(!opModeButtons[0].classList.contains('active'), 'Archive button should not be active')
    assert.strictEqual(opModeButtons[0].getAttribute('aria-pressed'), 'false')
  })

  it('should handle progressive disclosure (showing/hiding settings)', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    // Archive mode (default or set)
    sandbox.setActiveOpMode('archive')
    assert.strictEqual(elements['.settings'].style.display, 'block')
    assert.strictEqual(elements['#force'].parentElement.style.display, 'flex')

    // Suggestions mode
    sandbox.setActiveOpMode('suggestions')
    assert.strictEqual(elements['.settings'].style.display, 'none')
    assert.strictEqual(elements['#force'].parentElement.style.display, 'none')
  })
})

describe('renderState', () => {
  it('should update log and progress bar when running', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    const state = {
      status: 'running',
      log: ['Task 1', 'Task 2'],
      progress: { archived: 1, skipped: 1, total: 4 }
    }

    sandbox.renderState(state)

    assert.strictEqual(elements['#log'].textContent, 'Task 1\nTask 2')
    assert.strictEqual(elements['#progressFill'].style.width, '50%')
    assert.strictEqual(elements['#currentInfo'].textContent.includes('[2/4]'), true)
    assert.strictEqual(elements['#progressFill'].parentElement.getAttribute('aria-valuenow'), '50')
  })

  it('should handle done state correctly', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    const state = {
      status: 'done',
      results: [{ label: 'Repo A', count: 5 }]
    }

    sandbox.renderState(state)

    assert.strictEqual(elements['#progressFill'].style.width, '100%')
    assert.strictEqual(elements['#startBtn'].disabled, false)
    assert.strictEqual(elements['#resetBtn'].style.display, 'block')
    assert.strictEqual(elements['#summarySection'].style.display, 'block')
    assert.strictEqual(elements['#progressFill'].parentElement.getAttribute('aria-valuenow'), '100')
  })

  it('should handle error state correctly', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    const state = {
      status: 'error',
      error: 'API Failure'
    }

    sandbox.renderState(state)

    assert.strictEqual(elements['#currentInfo'].textContent, 'Error: API Failure')
    assert.strictEqual(elements['#progressFill'].style.background, '#f87171')
  })
})

describe('renderSummary', () => {
  it('should create elements for each result and a total', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    const results = [
      { label: 'Repo A', count: 5 },
      { label: 'Repo B', count: 3, err: 'Auth failed' }
    ]

    sandbox.renderSummary(results)

    const summaryDiv = elements['#summary']
    assert.strictEqual(summaryDiv.children.length, 3) // Repo A, Repo B, Total
    assert.strictEqual(summaryDiv.children[0].textContent, 'Repo A: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'Repo B: ERROR - Auth failed')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 8 processed')
  })
})

describe('Initialization and Storage', () => {
  it('should migrate ghToken from sync to local storage during init', (_t, done) => {
    const { sandbox, elements, syncStorage, localStorage } = setupPopupSandbox()
    syncStorage.ghToken = 'secret-token'
    syncStorage.ghOwner = 'some-owner'

    vm.runInContext(popupJs, sandbox)

    // Wait for async storage callbacks
    setTimeout(() => {
      assert.strictEqual(localStorage.ghToken, 'secret-token')
      assert.strictEqual(syncStorage.ghToken, undefined)
      assert.strictEqual(elements['#ghToken'].value, 'secret-token')
      assert.strictEqual(elements['#ghOwner'].value, 'some-owner')
      done()
    }, 10)
  })
})

describe('Button Event Handlers', () => {
  it('should send START message when startBtn is clicked', async () => {
    const { sandbox, elements } = setupPopupSandbox()
    let sentMessage = null
    sandbox.chrome.runtime.sendMessage = (msg) => {
      sentMessage = msg
    }

    vm.runInContext(popupJs, sandbox)

    elements['#ghOwner'].value = 'test-owner'
    elements['#ghToken'].value = 'test-token'

    await elements['#startBtn'].dispatchEvent('click')

    assert.strictEqual(sentMessage.action, 'START')
    assert.strictEqual(sentMessage.options.opMode, 'archive')
    assert.strictEqual(elements['#startBtn'].disabled, true)
    assert.strictEqual(elements['#startBtn'].textContent, '⏳ Dry Running Archive...')
  })

  it('should send RESET message when resetBtn is clicked', () => {
    const { sandbox, elements } = setupPopupSandbox()
    let sentMessage = null
    sandbox.chrome.runtime.sendMessage = (msg) => {
      sentMessage = msg
    }

    vm.runInContext(popupJs, sandbox)

    elements['#resetBtn'].dispatchEvent('click')

    assert.strictEqual(sentMessage.action, 'RESET')
    assert.strictEqual(elements['#startBtn'].disabled, false)
    assert.strictEqual(elements['#startBtn'].textContent, 'Dry Run Archive')
    assert.strictEqual(elements['#resetBtn'].style.display, 'none')
  })

  it('should move keyboard focus to startBtn after reset', () => {
    const { sandbox, elements } = setupPopupSandbox()
    sandbox.chrome.runtime.sendMessage = () => {}

    vm.runInContext(popupJs, sandbox)

    assert.strictEqual(elements['#startBtn'].focused, false)
    elements['#resetBtn'].dispatchEvent('click')
    assert.strictEqual(elements['#startBtn'].focused, true, 'focus should return to the primary action')
  })
})

describe('popup.html accessibility', () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, '../popup.html'), 'utf8')

  it('should link the GitHub token input to its hint via aria-describedby', () => {
    assert.ok(popupHtml.includes('id="ghTokenHint"'), 'token hint span should have an id')
    assert.ok(
      popupHtml.includes('aria-describedby="ghTokenHint"'),
      'token input should reference the hint via aria-describedby'
    )
  })

  it('should use explicit visible labels for radio groups via aria-labelledby', () => {
    assert.ok(popupHtml.includes('id="execModeLabel"'), 'execModeLabel should exist')
    assert.ok(popupHtml.includes('aria-labelledby="execModeLabel"'), 'mode radiogroup should use aria-labelledby')
    assert.ok(popupHtml.includes('id="scopeLabel"'), 'scopeLabel should exist')
    assert.ok(popupHtml.includes('aria-labelledby="scopeLabel"'), 'scope radiogroup should use aria-labelledby')
  })
})
