const fs = require('fs');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const code = fs.readFileSync('./background.js', 'utf8');

function createSandbox() {
  const mockChrome = {
    storage: {
      session: {
        get: async () => ({}),
        set: async () => {}
      },
      sync: {
        get: async () => ({})
      }
    },
    runtime: {
      getPlatformInfo: () => {},
      onMessage: { addListener: () => {} }
    }
  };

  const sandbox = {
    chrome: mockChrome,
    setInterval,
    clearInterval,
    console,
    setTimeout,
    Promise,
    fetch: async () => { throw new Error('fetch not mocked'); }
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  // Expose local variables that aren't automatically exported by vm
  sandbox.prCache = vm.runInContext('prCache', sandbox);
  sandbox.state = vm.runInContext('state', sandbox);
  sandbox.getOpenPRCount = vm.runInContext('getOpenPRCount', sandbox);

  return sandbox;
}

test('getOpenPRCount tests', async (t) => {
  let sandbox;

  t.beforeEach(() => {
    sandbox = createSandbox();
    sandbox.prCache.clear();
  });

  await t.test('returns PR count on successful API response', async () => {
    const mockPrs = [{ id: 1 }, { id: 2 }];

    sandbox.fetch = async (url, options) => {
      assert.strictEqual(url, 'https://api.github.com/repos/testowner/testrepo/pulls?state=open&per_page=100');
      assert.strictEqual(options.headers.Accept, 'application/vnd.github+json');
      assert.strictEqual(options.headers.Authorization, 'token test-token');

      return {
        ok: true,
        json: async () => mockPrs
      };
    };

    const count = await sandbox.getOpenPRCount('testowner', 'testrepo', 'test-token');
    assert.strictEqual(count, 2);
    assert.strictEqual(sandbox.prCache.get('testowner/testrepo'), 2);
  });

  await t.test('returns cached count if available, avoiding fetch', async () => {
    let fetchCalled = false;
    sandbox.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => [] };
    };

    sandbox.prCache.set('testowner/testrepo', 5);

    const count = await sandbox.getOpenPRCount('testowner', 'testrepo', 'test-token');

    assert.strictEqual(count, 5);
    assert.strictEqual(fetchCalled, false);
  });

  await t.test('returns 0 and logs warning on non-OK API response', async () => {
    sandbox.fetch = async () => {
      return {
        ok: false,
        status: 403
      };
    };

    const count = await sandbox.getOpenPRCount('testowner', 'testrepo', 'test-token');

    assert.strictEqual(count, 0);
    assert.strictEqual(sandbox.prCache.get('testowner/testrepo'), 0);

    const logs = sandbox.state.log;
    assert.ok(logs.some(log => log.includes('WARNING: GitHub API 403')));
  });

  await t.test('returns 0 and logs warning on fetch exception', async () => {
    sandbox.fetch = async () => {
      throw new Error('Network failure');
    };

    const count = await sandbox.getOpenPRCount('testowner', 'testrepo', 'test-token');

    assert.strictEqual(count, 0);
    assert.strictEqual(sandbox.prCache.get('testowner/testrepo'), 0);

    const logs = sandbox.state.log;
    assert.ok(logs.some(log => log.includes('WARNING: Could not check PRs')));
    assert.ok(logs.some(log => log.includes('Network failure')));
  });

  await t.test('works without token', async () => {
    sandbox.fetch = async (url, options) => {
      assert.strictEqual(options.headers.Authorization, undefined);
      return {
        ok: true,
        json: async () => [{ id: 1 }]
      };
    };

    const count = await sandbox.getOpenPRCount('testowner', 'testrepo', null);
    assert.strictEqual(count, 1);
  });
});
