const { setupEnvironment } = require('./tests/background.test.js')
const { sandbox } = setupEnvironment()
console.log('test_processSuggestionsForTab:', typeof sandbox.test_processSuggestionsForTab)
console.log('test_prepareTab:', typeof sandbox.test_prepareTab)
