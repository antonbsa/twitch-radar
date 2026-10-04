#!/usr/bin/env node
/**
 * Fails if the locale catalogs drifted from `en.json`, the source of truth:
 * missing or orphaned keys, empty values, or `{param}` placeholders that
 * don't match the `en` value's set (they would render literally).
 *
 * Usage: node infra/scripts/check-i18n.mjs
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..")
const LOCALES_DIR = resolve(REPO_ROOT, "apps/web/public/locales")

const SOURCE_LOCALE = "en"
const TRANSLATED_LOCALES = ["es", "pt-BR"]

// Same pattern `interpolate` in apps/web/src/lib/i18n.ts substitutes.
const PLACEHOLDER = /\{(\w+)\}/g

/** @returns {Record<string, unknown>} */
function loadCatalog(locale) {
  return JSON.parse(
    readFileSync(resolve(LOCALES_DIR, `${locale}.json`), "utf8"),
  )
}

/** @returns {string[]} sorted, de-duplicated placeholder names */
function placeholders(value) {
  return [...new Set([...value.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort()
}

const errors = []
const source = loadCatalog(SOURCE_LOCALE)

function checkValues(file, catalog) {
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${file}: "${key}" is empty or not a string`)
    }
  }
}

checkValues(`${SOURCE_LOCALE}.json`, source)

for (const locale of TRANSLATED_LOCALES) {
  const file = `${locale}.json`
  const catalog = loadCatalog(locale)
  checkValues(file, catalog)

  for (const key of Object.keys(source)) {
    if (!(key in catalog)) errors.push(`${file}: missing "${key}"`)
  }

  for (const [key, value] of Object.entries(catalog)) {
    if (!(key in source)) {
      errors.push(`${file}: "${key}" is not in ${SOURCE_LOCALE}.json`)
      continue
    }
    if (typeof value !== "string" || typeof source[key] !== "string") continue

    const expected = placeholders(source[key])
    const actual = placeholders(value)
    if (expected.join() !== actual.join()) {
      const fmt = (names) =>
        names.length ? names.map((n) => `{${n}}`).join(", ") : "none"
      errors.push(
        `${file}: "${key}" has placeholders ${fmt(actual)}, expected ${fmt(expected)}`,
      )
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n catalog check failed (${errors.length}):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(
  `i18n catalogs in sync: ${Object.keys(source).length} keys across ${[SOURCE_LOCALE, ...TRANSLATED_LOCALES].join(", ")}`,
)
