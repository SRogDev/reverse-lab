import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // @testing-library/react auto-cleanup registers on the global afterEach.
    globals: true,
    // Component smoke tests (*.test.tsx) opt into jsdom with a
    // `// @vitest-environment jsdom` pragma at the top of each file;
    // everything else stays in node (API route tests, unit tests).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
