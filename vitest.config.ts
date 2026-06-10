import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] }, // dist/test 的編譯副本不可跑（資產路徑以 repo root 為準）
});
