const fs = require('fs')
const popupTest = fs.readFileSync('tests/popup.test.js', 'utf8')
const lines = popupTest.split('\n')
console.log(lines.slice(620, 680).join('\n'))
