import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"

import prettierConfig from "./prettier.config.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      "apps/web/.wrangler/**",
      "apps/api/.wrangler/**",
      "node_modules/**",
    ],
  },
  ...compat.extends("@rocketseat/eslint-config/react"),
  {
    rules: {
      "prettier/prettier": ["error", prettierConfig],
    },
  },
]
