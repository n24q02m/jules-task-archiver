import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        content = f.read()

    # We want to replace the whole test case to be safe
    old_test = """  it('should throw error when JSON boundary cannot be found', () => {
    const { sandbox } = setupEnvironment()
    const response = ")]}'\\n\\n100\\n[["incomplete"
    assert.throws(() => {
      sandbox.test_parseResponse(response, 'rpc1')
    }, /Could not find JSON boundary in response/)
  })"""

    new_test = """  it('should throw error when JSON boundary cannot be found', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\\\'\\\\n\\\\n100\\\\n[[\\"incomplete'
    assert.throws(() => {
      sandbox.test_parseResponse(response, 'rpc1')
    }, /Could not find JSON boundary in response/)
  })"""

    if old_test in content:
        new_content = content.replace(old_test, new_test)
        with open(file_path, 'w') as f:
            f.write(new_content)
        print("Updated the problematic test case")
    else:
        print("Could not find the problematic test case exactly")

if __name__ == "__main__":
    main()
