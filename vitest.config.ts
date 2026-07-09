import { defineConfig } from 'vitest/config';

/**
 * Test runner config. Tests live in a dedicated top-level `tests/` folder
 * (kept out of `src/` so they never ship in the compiled `dist/` build):
 *   - tests/unit/        pure-function unit tests (no I/O)
 *   - tests/integration/ HTTP-level tests that drive the real Express app
 *
 * The persistence adapter (src/shared/adapters/db.ts) behaves as an in-memory
 * store when `connectMongo()` is never called, so integration tests need no
 * database and stay fully deterministic.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    hookTimeout: 20000,
    testTimeout: 20000,
    // Test-only environment. Setting these BEFORE the app's config loads means
    // dotenv (which never overrides an already-set var) leaves them intact:
    //   - ALLOWED_HOSTS empty -> the dev-only Host allow-list check is skipped,
    //     so supertest's ephemeral-port Host header isn't rejected.
    env: {
      NODE_ENV: 'test',
      ALLOWED_HOSTS: '',
    },
  },
});
