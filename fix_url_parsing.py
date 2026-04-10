import re
file_path = 'background.js'
with open(file_path, 'r') as f:
    content = f.read()

# Replace extractAccountNum with robust version
search = r'''function extractAccountNum\(url\) \{
  const parts = new URL\(url\)\.pathname\.split\('\/'\)
  const uIdx = parts\.indexOf\('u'\)
  return uIdx !== -1 && parts\[uIdx \+ 1\] \? parts\[uIdx \+ 1\] : '0'
\}'''

replace = r'''function extractAccountNum(url) {
  try {
    const parts = new URL(url).pathname.split('/')
    const uIdx = parts.indexOf('u')
    return uIdx !== -1 && parts[uIdx + 1] ? parts[uIdx + 1] : '0'
  } catch {
    return '0'
  }
}'''

content = re.sub(search, replace, content)
with open(file_path, 'w') as f:
    f.write(content)
