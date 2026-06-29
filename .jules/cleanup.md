## 2025-05-15 - Test helper exposure removal

**Learning:** Production code should not contain blocks dedicated to exposing internal state for tests (e.g., `if (TEST_MODE) { ... }`). This increases the bundle size and creates potential attack surface or confusion.

**Action:** Instead of hardcoding exposure in the source, use the test runner's environment (like `node:vm`) to inject exposure logic at runtime. By calling `vm.runInContext` after the source has been loaded, you can bind internal functions and variables to the sandbox global object for assertion.
