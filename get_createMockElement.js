const fs = require('fs')
const code = fs.readFileSync('tests/popup.test.js', 'utf8')
const lines = code.split('\n')
console.log(lines.slice(10, 100).join('\n'))
