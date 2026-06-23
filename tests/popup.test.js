const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

/**
 * Creates a mock DOM element with basic functionality.
 */
function createMockElement(tag = 'div', attrs = {}) {
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

/**
 * Creates a mock Chrome extension API.
 */
function createMockChrome(syncStorage, localStorage, sessionStorage, listeners) {
  return {
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
}

/**
 * Creates a mock Document object.
 */
function createMockDocument(elements, opModeButtons, radioStates) {
  return {
    querySelector: (sel) => {
      if (sel === 'input[name="mode"]:checked') return { value: radioStates.mode }
      if (sel === 'input[name="scope"]:checked') return { value: radioStates.scope }
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
}

function setupPopupSandbox() {
  const syncStorage = {}
  const localStorage = {}
  const sessionStorage = {}
  const radioStates = { mode: 'dry', scope: 'all' }
  const listeners = {
    storage: [],
    runtime: []
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
    '.settings': createMockElement('section'),
    '.setting-row': createMockElement('div')
  }

  // Parent element for elements that use .parentElement in popup.js
  elements['#force'].closest = (sel) => (sel === '.setting-row' ? elements['.setting-row'] : null)
  elements['#progressFill'].parentElement = createMockElement('div')

  const opModeButtons = [
    createMockElement('button', { dataset: { value: 'archive' } }),
    createMockElement('button', { dataset: { value: 'suggestions' } })
  ]

  const document = createMockDocument(elements, opModeButtons, radioStates)
  const chrome = createMockChrome(syncStorage, localStorage, sessionStorage, listeners)

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

  return { sandbox, elements, opModeButtons, syncStorage, localStorage, listeners, radioStates }
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
    assert.strictEqual(elements['#force'].closest('.setting-row').style.display, 'block')

    // Suggestions mode
    sandbox.setActiveOpMode('suggestions')
    assert.strictEqual(elements['.settings'].style.display, 'none')
    assert.strictEqual(elements['#force'].closest('.setting-row').style.display, 'none')
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
  it('should render an empty state message when no results are processed', () => {
    const { sandbox, elements } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    sandbox.renderSummary([])

    const summaryDiv = elements['#summary']
    assert.strictEqual(summaryDiv.children.length, 1)
    assert.strictEqual(summaryDiv.children[0].className, 'hint')
    assert.strictEqual(
      summaryDiv.children[0].textContent,
      'No items were processed. Try checking your scope or if tasks exist.'
    )
  })

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
    assert.ok(
      popupHtml.includes('<legend class="section-legend">Execution Mode</legend>'),
      'execution mode legend should exist'
    )
    assert.ok(popupHtml.includes('<fieldset class="radio-fieldset">'), 'mode fieldset should exist')
    assert.ok(popupHtml.includes('<legend class="section-legend">Scope</legend>'), 'scope legend should exist')
    assert.ok(popupHtml.includes('<fieldset class="radio-fieldset">'), 'scope fieldset should exist')
  })
})

describe('updateOpModeUI details', () => {
  it('should update startBtn text based on opMode and dryRun (Archive/Dry)', () => {
    const { sandbox, elements, radioStates } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    radioStates.mode = 'dry'
    sandbox.setActiveOpMode('archive')
    assert.strictEqual(elements['#startBtn'].textContent, 'Dry Run Archive')
  })

  it('should update startBtn text based on opMode and dryRun (Archive/Live)', () => {
    const { sandbox, elements, radioStates } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    radioStates.mode = 'live'
    sandbox.setActiveOpMode('archive')
    assert.strictEqual(elements['#startBtn'].textContent, 'Start Archiving')
  })

  it('should update startBtn text based on opMode and dryRun (Suggestions/Dry)', () => {
    const { sandbox, elements, radioStates } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    radioStates.mode = 'dry'
    sandbox.setActiveOpMode('suggestions')
    assert.strictEqual(elements['#startBtn'].textContent, 'Dry Run Suggestions')
  })

  it('should update startBtn text based on opMode and dryRun (Suggestions/Live)', () => {
    const { sandbox, elements, radioStates } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    radioStates.mode = 'live'
    sandbox.setActiveOpMode('suggestions')
    assert.strictEqual(elements['#startBtn'].textContent, 'Start Suggestions')
  })

  it('should NOT update startBtn text when button is disabled', () => {
    const { sandbox, elements, radioStates } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    elements['#startBtn'].disabled = true
    elements['#startBtn'].textContent = 'Original Text'

    radioStates.mode = 'live'
    sandbox.setActiveOpMode('archive')
    assert.strictEqual(elements['#startBtn'].textContent, 'Original Text')
  })
})

describe('updateOpModeUI direct calls', () => {
  it('should toggle classes and aria attributes directly', () => {
    const { sandbox, opModeButtons } = setupPopupSandbox()
    vm.runInContext(popupJs, sandbox)

    // Reset initial state
    opModeButtons[0].classList.toggle('active', false)
    opModeButtons[1].classList.toggle('active', false)

    sandbox.updateOpModeUI('archive')
    assert.ok(opModeButtons[0].classList.contains('active'))
    assert.strictEqual(opModeButtons[0].getAttribute('aria-pressed'), 'true')
    assert.ok(!opModeButtons[1].classList.contains('active'))
    assert.strictEqual(opModeButtons[1].getAttribute('aria-pressed'), 'false')

    sandbox.updateOpModeUI('suggestions')
    assert.ok(!opModeButtons[0].classList.contains('active'))
    assert.strictEqual(opModeButtons[0].getAttribute('aria-pressed'), 'false')
    assert.ok(opModeButtons[1].classList.contains('active'))
    assert.strictEqual(opModeButtons[1].getAttribute('aria-pressed'), 'true')
  })
})
