const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const popupScriptPath = path.join(__dirname, '..', 'popup.js')
const popupScriptContent = fs.readFileSync(popupScriptPath, 'utf8')

function setupEnvironment() {
  function createMockElement(tag, id = '', className = '') {
    const el = {
      tagName: tag.toUpperCase(),
      id,
      className,
      children: [],
      innerHTML: '',
      textContent: '',
      style: { display: 'none' },
      dataset: {},
      attributes: {},
      parentElement: null,
      eventListeners: {},
      appendChild(child) {
        if (child.tagName === 'FRAGMENT') {
          for (const grandChild of child.children) {
            grandChild.parentElement = this
            this.children.push(grandChild)
          }
          child.children = []
        } else {
          child.parentElement = this
          this.children.push(child)
        }
      },
      addEventListener(event, callback) {
        if (!this.eventListeners[event]) this.eventListeners[event] = []
        this.eventListeners[event].push(callback)
      },
      setAttribute(name, value) {
        this.attributes[name] = value
      },
      getAttribute(name) {
        return this.attributes[name]
      },
      classList: {
        toggle: (name, force) => {
          const has = el.className.split(' ').includes(name)
          if (force === undefined) force = !has
          if (force && !has) el.className = `${el.className} ${name}`.trim()
          else if (!force && has)
            el.className = el.className
              .split(' ')
              .filter((c) => c !== name)
              .join(' ')
        }
      },
      remove() {}
    }
    el.parentElement = el
    return el
  }

  const mockElements = {
    '#ghOwner': createMockElement('input', 'ghOwner'),
    '#ghToken': createMockElement('input', 'ghToken'),
    '#force': createMockElement('input', 'force'),
    '#startBtn': createMockElement('button', 'startBtn'),
    '#resetBtn': createMockElement('button', 'resetBtn'),
    '#progressSection': createMockElement('section', 'progressSection'),
    '#summarySection': createMockElement('section', 'summarySection'),
    '#currentInfo': createMockElement('div', 'currentInfo'),
    '#progressFill': createMockElement('div', 'progressFill'),
    '#log': createMockElement('pre', 'log'),
    '#summary': createMockElement('div', 'summary'),
    '#opMode': createMockElement('div', 'opMode'),
    '.settings': createMockElement('section', '', 'settings'),
    'input[name="mode"]:checked': { value: 'run' },
    'input[name="scope"]:checked': { value: 'all' }
  }

  mockElements['#progressFill'].parentElement = createMockElement('div')

  const documentMock = {
    querySelector: (sel) => mockElements[sel] || createMockElement('div'),
    querySelectorAll: (_sel) => [],
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => createMockElement('fragment')
  }

  const chromeMock = {
    storage: {
      sync: {
        get: (_keys, cb) => cb({}),
        set: (_data, cb) => cb?.(),
        remove: (_keys, cb) => cb?.()
      },
      local: {
        get: (_keys, cb) => cb({}),
        set: (_data, cb) => cb?.()
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
      query: () => Promise.resolve([])
    }
  }

  const sandbox = {
    document: documentMock,
    chrome: chromeMock,
    console,
    setTimeout,
    setInterval,
    clearInterval,
    Math,
    Date,
    JSON,
    String,
    Array,
    Object,
    Error,
    Promise,
    URL,
    globalThis: {}
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)

  const scriptContent = `
    ${popupScriptContent}
    globalThis.test_renderSummary = renderSummary;
    globalThis.test_renderState = renderState;
    globalThis.test_summaryDiv = summaryDiv;
    globalThis.test_summarySection = summarySection;
    globalThis.test_progressSection = progressSection;
    globalThis.test_currentInfo = currentInfo;
    globalThis.test_progressFill = progressFill;
    globalThis.test_logPre = logPre;
    globalThis.test_startBtn = startBtn;
    globalThis.test_resetBtn = resetBtn;
  `

  vm.runInContext(scriptContent, sandbox)

  return { sandbox, mockElements }
}

describe('renderSummary', () => {
  it('should render results correctly', () => {
    const { sandbox } = setupEnvironment()
    const results = [
      { label: 'default', count: 5 },
      { label: 'u/1', count: 3 }
    ]

    sandbox.test_renderSummary(results)

    assert.strictEqual(sandbox.test_summarySection.style.display, 'block')

    const summaryDiv = sandbox.test_summaryDiv
    assert.strictEqual(summaryDiv.children.length, 3) // 2 results + 1 total
    assert.strictEqual(summaryDiv.children[0].textContent, 'default: 5 processed')
    assert.strictEqual(summaryDiv.children[1].textContent, 'u/1: 3 processed')
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 8 processed')
    assert.strictEqual(summaryDiv.children[2].className, 'total')
  })

  it('should render errors correctly', () => {
    const { sandbox } = setupEnvironment()
    const results = [{ label: 'default', count: 0, err: 'Failed to fetch' }]

    sandbox.test_renderSummary(results)

    assert.strictEqual(sandbox.test_summarySection.style.display, 'block')
    const summaryDiv = sandbox.test_summaryDiv
    assert.strictEqual(summaryDiv.children[0].className, 'error')
    assert.strictEqual(summaryDiv.children[0].textContent, 'default: ERROR - Failed to fetch')
    assert.strictEqual(summaryDiv.children[1].textContent, 'TOTAL: 0 processed')
  })

  it('should handle empty or null results', () => {
    const { sandbox } = setupEnvironment()

    sandbox.test_renderSummary([])
    assert.strictEqual(sandbox.test_summarySection.style.display, 'none')

    sandbox.test_renderSummary(null)
    assert.strictEqual(sandbox.test_summarySection.style.display, 'none')
  })
})

describe('renderState', () => {
  it('should render running state', () => {
    const { sandbox } = setupEnvironment()
    const state = {
      status: 'running',
      currentTab: 'default',
      currentRepo: 'owner/repo',
      progress: { archived: 2, skipped: 1, total: 10 },
      log: ['Task 1 archived', 'Task 2 skipped']
    }

    sandbox.test_renderState(state)

    assert.strictEqual(sandbox.test_progressSection.style.display, 'block')
    assert.strictEqual(sandbox.test_logPre.textContent, 'Task 1 archived\nTask 2 skipped')
    assert.ok(sandbox.test_currentInfo.textContent.includes('default > owner/repo'))
    assert.ok(sandbox.test_currentInfo.textContent.includes('[3/10]'))
    assert.strictEqual(sandbox.test_progressFill.style.width, '30%')
  })

  it('should render done state', () => {
    const { sandbox } = setupEnvironment()
    const state = {
      status: 'done',
      results: [{ label: 'default', count: 5 }],
      log: ['Done']
    }

    sandbox.test_renderState(state)

    assert.strictEqual(sandbox.test_startBtn.disabled, false)
    assert.strictEqual(sandbox.test_startBtn.textContent, 'Start')
    assert.strictEqual(sandbox.test_resetBtn.style.display, 'block')
    assert.strictEqual(sandbox.test_progressFill.style.width, '100%')
    assert.strictEqual(sandbox.test_currentInfo.textContent, 'Complete')
    assert.strictEqual(sandbox.test_summarySection.style.display, 'block')
  })

  it('should render error state', () => {
    const { sandbox } = setupEnvironment()
    const state = {
      status: 'error',
      error: 'Something went wrong',
      log: ['Error occurred']
    }

    sandbox.test_renderState(state)

    assert.strictEqual(sandbox.test_startBtn.disabled, false)
    assert.strictEqual(sandbox.test_progressFill.style.background, '#f87171')
    assert.strictEqual(sandbox.test_currentInfo.textContent, 'Error: Something went wrong')
  })
})
