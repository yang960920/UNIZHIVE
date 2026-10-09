import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    include: ["apps/web/tests/**/*.integration.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
