import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Local worktrees and private challenge artifacts are not part of this checkout's suite.
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
