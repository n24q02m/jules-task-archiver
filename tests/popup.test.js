const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

describe('popup.js UI logic', () => {
  const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

  let sandbox
  let elements = {}

  function createMockElement(id = '', tagName = 'div') {
    return {
      id,
      tagName: tagName.toUpperCase(),
      textContent: '',
      style: {},
      disabled: false,
      scrollTop: 0,
      scrollHeight: 100,
      dataset: {},
      classList: {
        classes: new Set(),
        add: function (c) {
          this.classes.add(c)
        },
        remove: function (c) {
          this.classes.delete(c)
        },
        toggle: function (c, force) {
          if (force === undefined) {
            if (this.classes.has(c)) this.classes.delete(c)
            else this.classes.add(c)
          } else if (force) {
            this.classes.add(c)
          } else {
            this.classes.delete(c)
          }
        },
        contains: function (c) {
          return this.classes.has(c)
        }
      },
      attributes: {},
      setAttribute: function (name, val) {
        this.attributes[name] = val
      },
      getAttribute: function (name) {
        return this.attributes[name]
      },
      parentElement: {
        attributes: {},
        setAttribute: function (name, val) {
          this.attributes[name] = val
        },
        getAttribute: function (name) {
          return this.attributes[name]
        }
      },
      appendChild: function (child) {
        if (!this.children) this.children = []
        this.children.push(child)
      },
      addEventListener: () => {}
    }
  }

  beforeEach(() => {
    elements = {
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
      '#opMode button': [],
      '.settings': createMockElement('', 'div')
    }

    const document = {
      querySelector: (sel) => {
        if (sel.includes('input[name="mode"]:checked')) return { value: 'normal' }
        if (sel.includes('input[name="scope"]:checked')) return { value: 'all' }
        return elements[sel] || createMockElement()
      },
      querySelectorAll: (sel) => {
        if (sel === '#opMode button') return elements[sel]
        return { forEach: () => {} }
      },
      createElement: (tagName) => createMockElement('', tagName)
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

    sandbox = {
      document,
      chrome,
      console,
      setTimeout,
      setInterval,
      clearInterval,
      Math
    }
    vm.createContext(sandbox)
    vm.runInContext(popupJs, sandbox)
  })

  describe('renderState', () => {
    it('should update log display', () => {
      const state = {
        log: ['Line 1', 'Line 2'],
        status: 'running'
      }

      sandbox.renderState(state)

      assert.strictEqual(elements['#log'].textContent, 'Line 1\nLine 2')
      assert.strictEqual(elements['#progressSection'].style.display, 'block')
      assert.strictEqual(elements['#log'].scrollTop, elements['#log'].scrollHeight)
    })

    it('should show running status with tab and repo info', () => {
      const state = {
        status: 'running',
        currentTab: 'Tab Name',
        currentRepo: 'owner/repo'
      }

      sandbox.renderState(state)

      assert.strictEqual(elements['#currentInfo'].textContent, 'Tab Name > owner/repo')
    })

    it('should update progress bar and text in running status', () => {
      const state = {
        status: 'running',
        progress: {
          archived: 2,
          skipped: 1,
          total: 10
        }
      }

      sandbox.renderState(state)

      // (2 + 1) / 10 = 30%
      assert.strictEqual(elements['#progressFill'].style.width, '30%')
      assert.strictEqual(elements['#progressFill'].parentElement.attributes['aria-valuenow'], '30')
      assert.ok(elements['#currentInfo'].textContent.includes('[3/10]'))
    })

    it('should handle done status correctly', () => {
      const state = {
        status: 'done',
        results: [{ label: 'Repo A', count: 5 }]
      }

      sandbox.renderState(state)

      assert.strictEqual(sandbox.document.querySelector('#startBtn').disabled, false)
      assert.strictEqual(sandbox.document.querySelector('#startBtn').textContent, 'Start')
      assert.strictEqual(elements['#resetBtn'].style.display, 'block')
      assert.strictEqual(elements['#progressFill'].style.width, '100%')
      assert.strictEqual(elements['#currentInfo'].textContent, 'Complete')
      assert.strictEqual(elements['#summarySection'].style.display, 'block')
    })

    it('should handle error status correctly', () => {
      const state = {
        status: 'error',
        error: 'Something went wrong'
      }

      sandbox.renderState(state)

      assert.strictEqual(sandbox.document.querySelector('#startBtn').disabled, false)
      assert.strictEqual(elements['#currentInfo'].textContent, 'Error: Something went wrong')
      assert.strictEqual(elements['#progressFill'].style.background, '#f87171')
      assert.strictEqual(elements['#progressFill'].style.width, '100%')
    })
  })

  describe('renderSummary', () => {
    it('should render success and error results and total', () => {
      const results = [
        { label: 'Repo A', count: 5 },
        { label: 'Repo B', count: 0, err: 'API error' }
      ]

      sandbox.renderSummary(results)

      assert.strictEqual(elements['#summarySection'].style.display, 'block')
      const summaryDiv = elements['#summary']
      assert.strictEqual(summaryDiv.children.length, 3) // 2 results + 1 total

      // Success result
      assert.strictEqual(summaryDiv.children[0].textContent, 'Repo A: 5 processed')

      // Error result
      assert.strictEqual(summaryDiv.children[1].className, 'error')
      assert.strictEqual(summaryDiv.children[1].textContent, 'Repo B: ERROR - API error')

      // Total
      assert.strictEqual(summaryDiv.children[2].className, 'total')
      assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 5 processed')
    })

    it('should do nothing if results are empty', () => {
      elements['#summarySection'].style.display = 'none'
      sandbox.renderSummary([])
      assert.strictEqual(elements['#summarySection'].style.display, 'none')
    })
  })
})
