1. **Modify `background.js` to add `redirect: 'error'` to the fetch call.**
   - Change line 72 in `background.js` from `const res = await fetch(url, { headers, signal: controller.signal, ...rest })` to `const res = await fetch(url, { headers, signal: controller.signal, redirect: 'error', ...rest })`.

2. **Verify the change in `background.js`.**
   - Run `cat -n background.js | sed -n '65,80p'` to confirm the modification is present.

3. **Modify `tests/security.test.js` to mock fetch options and add a new test.**
   - In `tests/security.test.js`, modify the sandbox fetch mock (around line 165) to capture options. We'll change:
     ```javascript
<<<<<<< SEARCH
    fetch: async () => ({ ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" }),
=======
    fetch: async (url, options) => {
      chromeMock.lastFetchOptions = options;
      return { ok: true, json: async () => [], text: async () => ")]}'\n\n4\n[[]]" };
    },
>>>>>>> REPLACE
     ```
   - Then append a new test case inside `describe('jFetch SSRF Security', ...)` block to assert `redirect: 'error'`. We'll replace the closing block of this test suite:
     ```javascript
<<<<<<< SEARCH
  it('should block sending token to non-GitHub origin', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(sandbox.jFetch('https://jules.google.com/u/1/tasks', { token: 'secret-token' }), {
      message: /Security Error: Refusing to send GitHub token to non-GitHub origin/
    })
  })
})
=======
  it('should block sending token to non-GitHub origin', async () => {
    const { sandbox } = setupEnvironment()

    await assert.rejects(sandbox.jFetch('https://jules.google.com/u/1/tasks', { token: 'secret-token' }), {
      message: /Security Error: Refusing to send GitHub token to non-GitHub origin/
    })
  })

  it('should set redirect: error to prevent credential leakage via open redirects', async () => {
    const { sandbox, chromeMock } = setupEnvironment()
    await sandbox.jFetch('https://api.github.com/user', { token: 'secret-token' })
    assert.strictEqual(chromeMock.lastFetchOptions.redirect, 'error')
  })
})
>>>>>>> REPLACE
     ```

4. **Verify the changes in `tests/security.test.js`.**
   - Run `cat -n tests/security.test.js | grep -C 10 "should set redirect: error"` to confirm the test is added.

5. **Update `.Jules/sentinel.md` with Sentinel Journal entry.**
   - Run `echo -e "\n## $(date +%Y-%m-%d) - Prevent Credential Leakage via Open Redirects\n**Vulnerability:** The \`jFetch\` wrapper sent API tokens in the Authorization header without explicitly disabling redirects. If an endpoint had an open redirect vulnerability, \`fetch\` would follow it by default and leak the token to the third-party domain.\n**Learning:** The default behavior of \`fetch\` (follow redirects) is dangerous when transmitting credentials. Even if the initial request targets a trusted origin, the final destination can be hijacked.\n**Prevention:** Always set \`redirect: 'error'\` or \`redirect: 'manual'\` on network requests that transmit sensitive credentials to ensure they aren't silently leaked via unexpected cross-origin redirects." >> .Jules/sentinel.md`.

6. **Track the journal file.**
   - Run `git add -f .Jules/sentinel.md`.

7. **Verify journal entry.**
   - Run `cat .Jules/sentinel.md`.

8. **Run tests and linters.**
   - Run `pnpm test`.
   - Run `npx @biomejs/biome@2.4.16 check --write .`.

9. **Run pre-commit steps.**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

10. **Submit PR.**
   - Run the submit tool with descriptive branch and message.
