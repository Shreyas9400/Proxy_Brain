import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // db/client.ts throws at import time if this is unset. Pure-logic
      // tests never open a real connection, so a placeholder is enough.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
