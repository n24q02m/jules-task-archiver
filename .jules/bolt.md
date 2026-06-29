## 2026-06-29 - Testing Main World Broadcasts

**Learning:** [Insight] Testing functions in the browser's MAIN world requires a robust sandbox (vm.createContext) and explicit exposure via a test hook (globalThis.TEST_MODE) to ensure internal logic can be verified without compromising production code encapsulation.
**Action:** [How to apply next time] Always include a TEST_MODE conditional export for critical utility functions in content or main-world scripts to allow direct unit testing of state-dependent logic.
