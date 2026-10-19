import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',   // files that need a DOM say so: // @vitest-environment jsdom
    globals: true,
    setupFiles: ['tests/setup-umt.ts', 'tests/setup-theme.ts'],
  }
})
