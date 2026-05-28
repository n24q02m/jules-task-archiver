const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupSandbox() {
  const sandbox = {
    chrome: {
      storage: {
        session: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}) },
        local: { get: async () => ({}) }
      },
      runtime: {
        getPlatformInfo: async () => ({}),
        onMessage: { addListener: () => {} }
      }
    },
    fetch: async () => {},
    importScripts: () => {},
    setTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    Date,
    JSON,
    String,
    Array,
    Map,
    Object,
    Error,
    URL,
    URLSearchParams,
    Promise
  }
  vm.createContext(sandbox)
  vm.runInContext(bgScriptContent, sandbox)
  return sandbox
}

describe('PR Matching Logic', () => {
  const sandbox = setupSandbox()
  const taskHasOpenPR = sandbox.taskHasOpenPR

  it('should match when task title is in PR title', () => {
    const task = { title: 'Fix bug' }
    const openPRs = [{ titleLower: 'fix bug in orchestrator' }]
    const matcher = sandbox.createPRMatcher(openPRs)
    assert.strictEqual(taskHasOpenPR(task, openPRs, matcher), true)
  })

  it('should match when PR title is in task title', () => {
    const task = { title: '[feature] implement something new' }
    const openPRs = [{ titleLower: 'implement something' }]
    const matcher = sandbox.createPRMatcher(openPRs)
    assert.strictEqual(taskHasOpenPR(task, openPRs, matcher), true)
  })

  it('should be case insensitive', () => {
    const task = { title: 'FIX BUG' }
    const openPRs = [{ titleLower: 'fix bug' }]
    const matcher = sandbox.createPRMatcher(openPRs)
    assert.strictEqual(taskHasOpenPR(task, openPRs, matcher), true)
  })

  it('should handle special characters correctly', () => {
    const task = { title: 'Fix [PERF] issue' }
    const openPRs = [{ titleLower: 'fix [perf] issue' }]
    const matcher = sandbox.createPRMatcher(openPRs)
    assert.strictEqual(taskHasOpenPR(task, openPRs, matcher), true)
  })

  it('should return false if no match', () => {
    const task = { title: 'Fix bug' }
    const openPRs = [{ titleLower: 'feat: new feature' }]
    const matcher = sandbox.createPRMatcher(openPRs)
    assert.strictEqual(taskHasOpenPR(task, openPRs, matcher), false)
  })

  it('should handle empty lists', () => {
    const task = { title: 'Fix bug' }
    assert.strictEqual(taskHasOpenPR(task, []), false)
  })

  it('should handle missing titles', () => {
    assert.strictEqual(taskHasOpenPR({ title: '' }, [{ titleLower: 'test' }]), false)
    assert.strictEqual(taskHasOpenPR({ title: 'test' }, [{ titleLower: '' }]), true)
  })
})
