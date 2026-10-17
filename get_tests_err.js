const fs = require('fs')
console.log(fs.readFileSync('tests/popup.test.js', 'utf8').substring(600, 1000))
