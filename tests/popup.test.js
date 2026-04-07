const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function createMockElement(tagName = 'div') {
  const element = {
    tagName: tagName.toUpperCase(),
    _textContent: '',
    get textContent() {
      return this._textContent
    },
    set textContent(val) {
      this._textContent = val
      if (val === '') this.children = []
    },
    style: {},
    dataset: {},
    classList: {
      classes: new Set(),
      toggle: function (cls, state) {
        if (state !== undefined) {
          if (state) this.classes.add(cls)
          else this.classes.delete(cls)
        } else {
          if (this.classes.has(cls)) this.classes.delete(cls)
          else this.classes.add(cls)
        }
      },
      add: function (cls) {
        this.classes.add(cls)
      },
      contains: function (cls) {
        return this.classes.has(cls)
      }
    },
    attributes: {},
    setAttribute: function (name, val) {
      this.attributes[name] = val
    },
    getAttribute: function (name) {
      return this.attributes[name]
    },
    addEventListener: () => {},
    appendChild: function (child) {
      if (!this.children) this.children = []
      this.children.push(child)
    },
    children: [],
    get parentElement() {
      return this._parentElement || { setAttribute: () => {}, style: {} }
    },
    set parentElement(val) {
      this._parentElement = val
    },
    disabled: false,
    scrollTop: 0,
    scrollHeight: 100,
    get className() {
      return Array.from(this.classList.classes).join(' ')
    },
    set className(val) {
      this.classList.classes.clear()
      val.split(' ').forEach((c) => {
        if (c) this.classList.classes.add(c)
      })
    }
  }
  return element
}

describe('popup.js UI Rendering', () => {
  let sandbox
  let elements

  beforeEach(() => {
    elements = {
      '#ghOwner': createMockElement('input'),
      '#ghToken': createMockElement('input'),
      '#force': createMockElement('input'),
      '#startBtn': createMockElement('button'),
      '#resetBtn': createMockElement('button'),
      '#progressSection': createMockElement('section'),
      '#summarySection': createMockElement('section'),
      '#currentInfo': createMockElement('div'),
      '#progressFill': createMockElement('div'),
      '#log': createMockElement('pre'),
      '#summary': createMockElement('div'),
      '.settings': createMockElement('section'),
      'input[name="mode"]:checked': { value: 'dry' },
      'input[name="scope"]:checked': { value: 'all' }
    }

    // Special case for progressFill parent
    const progressFillParent = createMockElement('div')
    elements['#progressFill'].parentElement = progressFillParent

    const document = {
      querySelector: (sel) => elements[sel] || createMockElement(),
      querySelectorAll: (sel) => {
        if (sel === '#opMode button') return []
        return []
      },
      createElement: (tag) => createMockElement(tag)
    }

    const chrome = {
      storage: {
        sync: {
          get: (_keys, cb) => cb({}),
          set: () => {},
          remove: () => {},
          onChanged: { addListener: () => {} }
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
        query: () => Promise.resolve([])
      }
    }

    sandbox = {
      document,
      chrome,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL
    }
    vm.createContext(sandbox)
    vm.runInContext(popupJs, sandbox)
  })

  describe('renderState', () => {
    it('should update log and scroll to bottom', () => {
      const state = {
        log: ['Line 1', 'Line 2']
      }
      sandbox.renderState(state)

      assert.strictEqual(elements['#log'].textContent, 'Line 1\nLine 2')
      assert.strictEqual(elements['#log'].scrollTop, elements['#log'].scrollHeight)
      assert.strictEqual(elements['#progressSection'].style.display, 'block')
    })

    it('should update progress and info when running', () => {
      const state = {
        status: 'running',
        currentTab: 'u/1',
        currentRepo: 'my-repo',
        progress: { archived: 2, skipped: 1, total: 10 }
      }
      sandbox.renderState(state)

      assert.strictEqual(elements['#currentInfo'].textContent, 'u/1 > my-repo [3/10]')
      assert.strictEqual(elements['#progressFill'].style.width, '30%')
      assert.strictEqual(elements['#progressFill'].parentElement.attributes['aria-valuenow'], '30')
    })

    it('should handle "done" state', () => {
      const state = {
        status: 'done',
        results: [{ label: 'Tab 1', count: 5 }]
      }
      sandbox.renderState(state)

      assert.strictEqual(elements['#startBtn'].disabled, false)
      assert.strictEqual(elements['#startBtn'].textContent, 'Start')
      assert.strictEqual(elements['#resetBtn'].style.display, 'block')
      assert.strictEqual(elements['#progressFill'].style.width, '100%')
      assert.strictEqual(elements['#currentInfo'].textContent, 'Complete')
      assert.strictEqual(elements['#summarySection'].style.display, 'block')
    })

    it('should handle "error" state', () => {
      const state = {
        status: 'error',
        error: 'Something went wrong'
      }
      sandbox.renderState(state)

      assert.strictEqual(elements['#startBtn'].disabled, false)
      assert.strictEqual(elements['#currentInfo'].textContent, 'Error: Something went wrong')
      assert.strictEqual(elements['#progressFill'].style.background, '#f87171')
    })
  })

  describe('renderSummary', () => {
    it('should render results and grand total', () => {
      const results = [
        { label: 'Tab 1', count: 3 },
        { label: 'Tab 2', count: 2, err: 'Failed' }
      ]
      sandbox.renderSummary(results)

      const summary = elements['#summary']
      assert.strictEqual(summary.children.length, 3) // 2 results + 1 total
      assert.strictEqual(summary.children[0].textContent, 'Tab 1: 3 processed')
      assert.strictEqual(summary.children[1].textContent, 'Tab 2: ERROR - Failed')
      assert.strictEqual(summary.children[1].classList.contains('error'), true)
      assert.strictEqual(summary.children[2].textContent, 'TOTAL: 5 processed')
      assert.strictEqual(summary.children[2].classList.contains('total'), true)
    })

    it('should clear previous summary', () => {
      elements['#summary'].children = [createMockElement()]
      const results = [{ label: 'Tab 1', count: 1 }]
      sandbox.renderSummary(results)

      // The previous child should be cleared when summaryDiv.textContent = ''
      assert.strictEqual(elements['#summary'].children.length, 2) // 1 result + 1 total
      assert.strictEqual(elements['#summary'].children[0].textContent, 'Tab 1: 1 processed')
    })
  })
})
