import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        content = f.read()

    bad_part1 = """  it('should return null when rpcId is not found', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}'

100
[["wrb.fr","otherRpc","[]",null,null,null,"generic"]]'"""

    good_part1 = """  it('should return null when rpcId is not found', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\\'\\n\\n100\\n[["wrb.fr","otherRpc","[]",null,null,null,"generic"]]'"""

    bad_part2 = """  it('should throw error for invalid JSON payload', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}'

100
[["wrb.fr","rpc1","{invalid json}",null,null,null,"generic"]]'"""

    good_part2 = """  it('should throw error for invalid JSON payload', () => {
    const { sandbox } = setupEnvironment()
    const response = ')]}\\'\\n\\n100\\n[["wrb.fr","rpc1","{invalid json}",null,null,null,"generic"]]'"""

    new_content = content.replace(bad_part1, good_part1).replace(bad_part2, good_part2)

    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Fixed tests/background.test.js formatting")

if __name__ == "__main__":
    main()
