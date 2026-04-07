import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        content = f.read()

    search_str = """    const result = sandbox.test_parseResponse(response, 'p1Takd')
    assert.deepStrictEqual(result, [['task1', 'task2']])
  })
})"""

    replace_str = """    const result = sandbox.test_parseResponse(response, 'p1Takd')
    assert.deepStrictEqual(result, [['task1', 'task2']])
  })

  it('should throw error for response without newline', () => {
    const { sandbox } = setupEnvironment()
    const response = ")]}' invalid"
    assert.throws(() => {
      sandbox.test_parseResponse(response, 'rpc1')
    }, /Invalid batchexecute response/)
  })

  it('should throw error when JSON boundary cannot be found', () => {
    const { sandbox } = setupEnvironment()
    const response = ")]}'\n\n100\n[[\"incomplete"
    assert.throws(() => {
      sandbox.test_parseResponse(response, 'rpc1')
    }, /Could not find JSON boundary in response/)
  })

  it('should return null when rpcId is not found', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n100\n[["wrb.fr","otherRpc","[]",null,null,null,"generic"]]'
    const result = sandbox.test_parseResponse(response, 'missingRpc')
    assert.strictEqual(result, null)
  })

  it('should throw error for invalid JSON payload', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\'\n\n100\n[["wrb.fr","rpc1","{invalid json}",null,null,null,"generic"]]'
    assert.throws(() => {
      sandbox.test_parseResponse(response, 'rpc1')
    }, SyntaxError)
  })
})"""

    if search_str in content:
        new_content = content.replace(search_str, replace_str)
        with open(file_path, 'w') as f:
            f.write(new_content)
        print("Successfully updated tests/background.test.js")
    else:
        print("Search string not found")
        sys.exit(1)

if __name__ == "__main__":
    main()
