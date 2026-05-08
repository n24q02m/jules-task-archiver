      { id: 3, url: 'https://accounts.google.com/ServiceLogin' },
      { id: 4, url: 'https://jules.google.com/u/1/session' }
    ]
    sandbox.chrome.tabs.query = async () => mockTabs

    const tabs = await sandbox.test_getJulesTabs()
    assert.strictEqual(tabs.length, 3)
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[0].url), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[1].url), '1')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[2].url), '2')
  })

  it('should handle tabs without account segments correctly (as 0)', async () => {
    const { sandbox } = setupEnvironment()
    const mockTabs = [
      { id: 1, url: 'https://jules.google.com/u/1/session' },
      { id: 2, url: 'https://jules.google.com/tasks' }
    ]
    sandbox.chrome.tabs.query = async () => mockTabs

    const tabs = await sandbox.test_getJulesTabs()
    assert.strictEqual(tabs.length, 2)
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[0].url), '0')
    assert.strictEqual(sandbox.test_extractAccountNum(tabs[1].url), '1')
  })
})

// =============================================================================
// List Suggestions Tests
// =============================================================================

describe('listSuggestions', () => {
  it('should return parsed suggestions on valid response', async () => {
    const { sandbox } = setupEnvironment()
    const rawSuggestion = [
      'id-123',
      [
        'Title',
        'Desc',
        'https://github.com/o/r/pull/1',
        'path/to/file.ts',
        10,
        0.9,
        'Rationale',
        'code',
        'typescript',
        'cleanup',
        1
      ],
      'open',
      [],
      'cleanup-tab'
    ]

    sandbox.callBatchExecute = async (rpcId, payload, _config) => {
      assert.strictEqual(rpcId, 'hQP40d')
      assert.strictEqual(payload[0], 'owner/repo')
      return [[rawSuggestion]]
    }

    const suggestions = await sandbox.test_listSuggestions('owner/repo', {})
    assert.strictEqual(suggestions.length, 1)
    assert.strictEqual(suggestions[0].id, 'id-123')
    assert.strictEqual(suggestions[0].title, 'Title')
    assert.strictEqual(suggestions[0].categorySlug, 'cleanup')
  })

  it('should return empty array if result is null', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => null

    const suggestions = await sandbox.test_listSuggestions('owner/repo', {})
    assert.strictEqual(suggestions.length, 0)
  })

  it('should return empty array if result is not an array', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => ({})

    const suggestions = await sandbox.test_listSuggestions('owner/repo', {})
    assert.strictEqual(suggestions.length, 0)
  })

  it('should return empty array if result[0] is not an array', async () => {
    const { sandbox } = setupEnvironment()
    sandbox.callBatchExecute = async () => [null]

    const suggestions = await sandbox.test_listSuggestions('owner/repo', {})
    assert.strictEqual(suggestions.length, 0)
  })

  it('should filter out null suggestions', async () => {
    const { sandbox } = setupEnvironment()
    // [null] and ["invalid"] will result in parseSuggestion returning null
    sandbox.callBatchExecute = async () => [[[null], ['invalid']]]

    const suggestions = await sandbox.test_listSuggestions('owner/repo', {})
    assert.strictEqual(suggestions.length, 0)
  })
})
