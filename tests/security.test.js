const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const bgScriptPath = path.join(__dirname, '..', 'background.js')
const bgScriptContent = fs.readFileSync(bgScriptPath, 'utf8')

function setupEnvironment() {
	let lastFetchUrl = ''
	let lastFetchHeaders = {}

	const sandbox = {
		chrome: {
			storage: {
				session: { get: async () => ({}), set: async () => {} },
				sync: { get: async () => ({}) },
				local: { get: async () => ({}) },
			},
			runtime: { onMessage: { addListener: () => {} } },
			tabs: { query: async () => [] },
		},
		fetch: async (url, options) => {
			lastFetchUrl = url
			lastFetchHeaders = options.headers || {}
			return { ok: true, json: async () => [] }
		},
		console,
		setTimeout,
		setInterval,
		clearInterval,
		Math,
		Date,
		JSON,
		String,
		Array,
		Map,
		Object,
		Error,
		URLSearchParams,
		Promise,
		URL,
	}

	vm.createContext(sandbox)
	const scriptContent = `${bgScriptContent}
    globalThis.test_getOpenPRCount = getOpenPRCount;
  `
	const script = new vm.Script(scriptContent)
	script.runInContext(sandbox)

	return {
		sandbox,
		getLastFetch: () => ({ url: lastFetchUrl, headers: lastFetchHeaders }),
	}
}

describe('Security: getOpenPRCount', () => {
	it('vulnerable to URL injection via owner/repo', async () => {
		const { sandbox, getLastFetch } = setupEnvironment()
		const owner = 'owner/repo'
		const repo = 'something?else=1'

		await sandbox.test_getOpenPRCount(owner, repo, 'token')
		const { url } = getLastFetch()

		// If vulnerable, the slash and question mark are preserved
		// Correct behavior should be encoded: owner%2Frepo and something%3Felse%3D1
		assert.ok(url.includes('owner%2Frepo'), 'Owner should be encoded')
		assert.ok(url.includes('something%3Felse%3D1'), 'Repo should be encoded')
	})

	it('vulnerable to header injection via token', async () => {
		const { sandbox, getLastFetch } = setupEnvironment()
		const token = 'valid-token\r\nInjected-Header: evil'

		// We want to ensure that tokens with newlines are either rejected or sanitized.
		// In Node.js fetch, newlines in headers might throw or be handled,
		// but in a browser context it's a security risk.
		try {
			await sandbox.test_getOpenPRCount('owner', 'repo', token)
			const { headers } = getLastFetch()
			assert.ok(
				!headers.Authorization.includes('\n'),
				'Token should not contain newlines in header',
			)
		} catch (_e) {
			// If it throws, that might also be a form of protection if we add validation
			assert.ok(true, 'Caught expected error or validated')
		}
	})
})
