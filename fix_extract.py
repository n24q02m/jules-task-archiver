import sys

def main():
    file_path = 'background.js'
    with open(file_path, 'r') as f:
        content = f.read()

    search_str = """function extractAccountNum(url) {
  const parts = new URL(url).pathname.split('/')
  const uIdx = parts.indexOf('u')
  return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'
}"""

    replace_str = """function extractAccountNum(url) {
  try {
    const parts = new URL(url).pathname.split('/')
    const uIdx = parts.indexOf('u')
    return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'
  } catch {
    return '0'
  }
}"""

    if search_str in content:
        new_content = content.replace(search_str, replace_str)
        with open(file_path, 'w') as f:
            f.write(new_content)
        print("Successfully updated background.js")
    else:
        print("Search string not found")
        sys.exit(1)

if __name__ == "__main__":
    main()
