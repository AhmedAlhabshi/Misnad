import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Deliberately separate from `vite.config.ts` (not an extension of it) —
 * the real dev/build config requires `PORT`/`BASE_PATH` env vars that have
 * no meaning for a test run and would just be friction here. Only what
 * component tests actually need: the `@` alias and JSX support.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setupTests.ts"],
    css: false,
    // Only component-rendering tests (`.test.tsx`) run under Vitest — the
    // plain-logic `.test.ts` files under `src/lib/__tests__` are executed
    // by this package's existing `tsx`-script `test` runner instead (they
    // have no `describe`/`it` blocks at all) and must never be collected
    // here, or Vitest reports them as empty suites.
    include: ["src/**/*.test.tsx"],
  },
});
