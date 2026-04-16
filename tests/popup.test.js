const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const popupJs = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8')

function createEl(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    classList: {
      classes: new Set(),
      toggle(cls, force) {
        if (force) this.classes.add(cls)
        else this.classes.delete(cls)
      },
      contains(cls) {
        return this.classes.has(cls)
      }
    },
    attributes: {},
    setAttribute(name, val) {
      this.attributes[name] = val
    },
    getAttribute(name) {
      return this.attributes[name]
    },
    style: { display: '' },
    parentElement: null,
    addEventListener: () => {}
  }
}

describe('popup.js: setActiveOpMode', () => {
  let sandbox
  let buttons
  let settingsSection
  let forceCheckbox
  let forceCheckboxContainer

  beforeEach(() => {
    buttons = [
      { ...createEl('button'), dataset: { value: 'archive' } },
      { ...createEl('button'), dataset: { value: 'suggestions' } }
    ]
    settingsSection = createEl('div')
    forceCheckbox = createEl('input')
    forceCheckboxContainer = createEl('div')
    forceCheckbox.parentElement = forceCheckboxContainer

    const elements = {
      '#ghOwner': createEl('input'),
      '#ghToken': createEl('input'),
      '#force': forceCheckbox,
      '#startBtn': createEl('button'),
      '#resetBtn': createEl('button'),
      '#progressSection': createEl('div'),
      '#summarySection': createEl('div'),
      '#currentInfo': createEl('div'),
      '#progressFill': { ...createEl('div'), parentElement: createEl('div') },
      '#log': createEl('pre'),
      '#summary': createEl('div'),
      '.settings': settingsSection
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
      chrome,
      console,
      setTimeout,
      document: {
        querySelector: (sel) => elements[sel] || null,
        querySelectorAll: (sel) => {
          if (sel === '#opMode button') return buttons
          return []
        },
        createElement: () => createEl()
      }
    }
    vm.createContext(sandbox)
    // Expose opMode via a helper function appended to the script
    const scriptToRun = `${popupJs}\n;globalThis.getOpMode = () => opMode;`
    vm.runInContext(scriptToRun, sandbox)
  })

  it('should set the active class on the selected button and remove from others', () => {
    sandbox.setActiveOpMode('suggestions')

    assert.strictEqual(buttons[0].classList.contains('active'), false)
    assert.strictEqual(buttons[1].classList.contains('active'), true)
    assert.strictEqual(buttons[0].getAttribute('aria-pressed'), 'false')
    assert.strictEqual(buttons[1].getAttribute('aria-pressed'), 'true')
    assert.strictEqual(sandbox.getOpMode(), 'suggestions')
  })

  it('should show settings and force checkbox when mode is archive', () => {
    sandbox.setActiveOpMode('archive')

    assert.strictEqual(settingsSection.style.display, 'block')
    assert.strictEqual(forceCheckboxContainer.style.display, 'flex')
    assert.strictEqual(sandbox.getOpMode(), 'archive')
  })

  it('should hide settings and force checkbox when mode is suggestions', () => {
    sandbox.setActiveOpMode('suggestions')

    assert.strictEqual(settingsSection.style.display, 'none')
    assert.strictEqual(forceCheckboxContainer.style.display, 'none')
    assert.strictEqual(sandbox.getOpMode(), 'suggestions')
  })
})
