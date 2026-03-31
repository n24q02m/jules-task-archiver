const { test, describe, beforeEach, it } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlCode = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
const scriptCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

describe('popup.js renderState', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    // Setup JSDOM
    dom = new JSDOM(htmlCode, { runScripts: "dangerously" });
    window = dom.window;
    document = window.document;

    // Mock chrome APIs
    window.chrome = {
      storage: {
        sync: {
          get: (keys, cb) => cb({}),
          set: (data) => {}
        },
        session: {
          get: (keys, cb) => cb({}),
          set: (data) => {}
        },
        onChanged: {
          addListener: () => {}
        }
      },
      runtime: {
        sendMessage: (msg, cb) => {
          if (cb) cb({ status: 'idle' });
        }
      },
      tabs: {
        query: (query, cb) => cb([{ id: 1 }])
      }
    };

    // Inject code
    const scriptEl = document.createElement('script');
    scriptEl.textContent = scriptCode;
    document.body.appendChild(scriptEl);
  });

  it('renders running state correctly', () => {
    const state = {
      status: 'running',
      currentTab: 'Tab 1',
      currentRepo: 'org/repo',
      progress: {
        total: 10,
        archived: 3,
        skipped: 2
      },
      log: ['Task 1 archived', 'Task 2 skipped']
    };

    window.renderState(state);

    const currentInfo = document.getElementById('currentInfo');
    const progressFill = document.getElementById('progressFill');
    const logPre = document.getElementById('log');
    const progressSection = document.getElementById('progressSection');

    assert.strictEqual(progressSection.style.display, 'block');
    assert.strictEqual(logPre.textContent, 'Task 1 archived\nTask 2 skipped');
    assert.strictEqual(currentInfo.textContent, 'Tab 1 > org/repo [5/10]');
    assert.strictEqual(progressFill.style.width, '50%');
  });

  it('renders done state correctly', () => {
    const state = {
      status: 'done',
      results: [
        { label: 'org/repo1', count: 5 },
        { label: 'org/repo2', count: 0, err: 'API error' }
      ]
    };

    window.renderState(state);

    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const progressFill = document.getElementById('progressFill');
    const currentInfo = document.getElementById('currentInfo');
    const summarySection = document.getElementById('summarySection');
    const summaryDiv = document.getElementById('summary');

    assert.strictEqual(startBtn.disabled, false);
    assert.strictEqual(startBtn.textContent, 'Start');
    assert.strictEqual(resetBtn.style.display, 'block');
    assert.strictEqual(progressFill.style.width, '100%');
    assert.strictEqual(currentInfo.textContent, 'Complete');

    assert.strictEqual(summarySection.style.display, 'block');
    assert.strictEqual(summaryDiv.children.length, 3);
    assert.strictEqual(summaryDiv.children[0].textContent, 'org/repo1: 5 archived');
    assert.strictEqual(summaryDiv.children[1].textContent, 'org/repo2: ERROR - API error');
    assert.strictEqual(summaryDiv.children[1].className, 'error');
    assert.strictEqual(summaryDiv.children[2].textContent, 'TOTAL: 5 tasks archived');
    assert.strictEqual(summaryDiv.children[2].className, 'total');
  });

  it('renders error state correctly', () => {
    const state = {
      status: 'error',
      error: 'Network failure'
    };

    window.renderState(state);

    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const progressFill = document.getElementById('progressFill');
    const currentInfo = document.getElementById('currentInfo');

    assert.strictEqual(startBtn.disabled, false);
    assert.strictEqual(startBtn.textContent, 'Start');
    assert.strictEqual(resetBtn.style.display, 'block');
    assert.strictEqual(progressFill.style.width, '100%');
    assert.strictEqual(progressFill.style.background, 'rgb(248, 113, 113)');
    assert.strictEqual(currentInfo.textContent, 'Error: Network failure');
  });

  it('handles empty results gracefully', () => {
    const state = {
      status: 'done',
      results: []
    };

    window.renderState(state);

    const summarySection = document.getElementById('summarySection');
    assert.strictEqual(summarySection.style.display, 'none');
  });

  it('does not crash if progress is null', () => {
    const state = {
      status: 'running',
      currentTab: 'Tab 1',
      currentRepo: 'org/repo',
      progress: null,
      log: []
    };

    window.renderState(state);

    const currentInfo = document.getElementById('currentInfo');
    assert.strictEqual(currentInfo.textContent, 'Tab 1 > org/repo');
  });
});
