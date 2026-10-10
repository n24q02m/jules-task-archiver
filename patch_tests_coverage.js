const fs = require('fs')
let code = fs.readFileSync('tests/popup.test.js', 'utf8')

const marker = "describe('Interactive Hints', () => {"
const index = code.indexOf(marker)
if (index > -1) {
  code = code.substring(0, index)
}

const goodTest = `
describe('Interactive Hints', () => {
  it('should cover the block-hint click listener', () => {
    const { sandbox } = setupPopupSandbox()

    const hint = createMockElement('span', { class: 'block-hint', id: 'myHint' })
    hint.id = 'myHint'
    const input = createMockElement('input', { type: 'checkbox' })
    Object.defineProperty(input, 'type', { get: () => 'checkbox' })
    let clicked = false
    input.click = () => { clicked = true }

    const oldQSA = sandbox.document.querySelectorAll
    sandbox.document.querySelectorAll = (sel) => {
      if (sel === '.block-hint') return [hint]
      return oldQSA(sel)
    }

    const oldQS = sandbox.document.querySelector
    sandbox.document.querySelector = (sel) => {
      if (sel?.includes('myHint')) return input
      return oldQS(sel)
    }

    vm.runInContext(popupJs, sandbox, { filename: popupJsPath })

    if (hint.listeners?.click) {
      hint.listeners.click.forEach((cb) => { cb() })
    }

    assert.strictEqual(clicked, true)
  })

  it('should cover the block-hint focus listener', () => {
    const { sandbox } = setupPopupSandbox()

    const hint = createMockElement('span', { class: 'block-hint', id: 'textHint' })
    hint.id = 'textHint'
    const input = createMockElement('input', { type: 'text' })
    Object.defineProperty(input, 'type', { get: () => 'text' })
    let focused = false
    input.focus = () => { focused = true }

    const oldQSA = sandbox.document.querySelectorAll
    sandbox.document.querySelectorAll = (sel) => {
      if (sel === '.block-hint') return [hint]
      return oldQSA(sel)
    }

    const oldQS = sandbox.document.querySelector
    sandbox.document.querySelector = (sel) => {
      if (sel?.includes('textHint')) return input
      return oldQS(sel)
    }

    vm.runInContext(popupJs, sandbox, { filename: popupJsPath })

    if (hint.listeners?.click) {
      hint.listeners.click.forEach((cb) => { cb() })
    }

    assert.strictEqual(focused, true)
  })

  it('should cover no id hint', () => {
    const { sandbox } = setupPopupSandbox()
    const hint = createMockElement('span', { class: 'block-hint' })

    const oldQSA = sandbox.document.querySelectorAll
    sandbox.document.querySelectorAll = (sel) => {
      if (sel === '.block-hint') return [hint]
      return oldQSA(sel)
    }

    vm.runInContext(popupJs, sandbox, { filename: popupJsPath })

    if (hint.listeners?.click) {
      hint.listeners.click.forEach((cb) => { cb() })
    }
  })

  it('should cover no input found', () => {
    const { sandbox } = setupPopupSandbox()
    const hint = createMockElement('span', { class: 'block-hint', id: 'missingHint' })
    hint.id = 'missingHint'

    const oldQSA = sandbox.document.querySelectorAll
    sandbox.document.querySelectorAll = (sel) => {
      if (sel === '.block-hint') return [hint]
      return oldQSA(sel)
    }

    const oldQS = sandbox.document.querySelector
    sandbox.document.querySelector = (sel) => {
      if (sel?.includes('missingHint')) return null
      return oldQS(sel)
    }

    vm.runInContext(popupJs, sandbox, { filename: popupJsPath })

    if (hint.listeners?.click) {
      hint.listeners.click.forEach((cb) => { cb() })
    }
  })
})
`

fs.writeFileSync('tests/popup.test.js', code + goodTest)
