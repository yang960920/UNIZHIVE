import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  {
    settings: {
      next: { rootDir: "apps/web/" },
      react: { version: "19.3" },
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
    "docs/product-blueprint/**",
    "**/migrations/**",
    "artifacts/**",
  ]),
]);
