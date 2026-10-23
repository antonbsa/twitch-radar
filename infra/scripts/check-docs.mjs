#!/usr/bin/env node
/**
 * Fails if a relative Markdown link points to a missing file or to a heading
 * anchor that doesn't exist. External URLs are not checked (ADR 0065).
 *
 * Scope: README.md, GLOSSARY.md, docs/**, every AGENTS.md,
 * .claude/agents/*.md and .claude/skills/**\/*.md.
 *
 * Usage: node infra/scripts/check-docs.mjs
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..")

const IN_SCOPE = [
  /^(README|GLOSSARY)\.md$/,
  /^docs\/.*\.md$/,
  /(^|\/)AGENTS\.md$/,
  /^\.claude\/agents\/[^/]+\.md$/,
  /^\.claude\/skills\/.*\.md$/,
]

/** Tracked and untracked-but-not-ignored files, so node_modules and .agents/ stay out. */
function docFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
  return out
    .split("\0")
    .filter((f) => f && IN_SCOPE.some((re) => re.test(f)))
    .filter((f) => existsSync(resolve(REPO_ROOT, f)))
}

/** Blanks fenced code blocks and inline code spans, keeping line numbers. */
function stripCode(text) {
  let fence = null
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(/^\s*(`{3,}|~{3,})/)
      if (m) {
        if (!fence) fence = m[1][0]
        else if (m[1][0] === fence) fence = null
        return ""
      }
      return fence ? "" : line.replace(/`[^`]*`/g, "")
    })
    .join("\n")
}

/** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
function slugify(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*~`]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-")
}

const anchorCache = new Map()

/** @returns {Set<string>} heading slugs (with GitHub's -1, -2 duplicate suffixes) and explicit HTML ids */
function anchorsOf(path) {
  if (anchorCache.has(path)) return anchorCache.get(path)
  const text = readFileSync(path, "utf8")
  const anchors = new Set()
  const seen = new Map()
  let fence = null
  for (const line of text.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const h = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/)
    if (h) {
      const slug = slugify(h[1])
      const n = seen.get(slug) ?? 0
      seen.set(slug, n + 1)
      anchors.add(n === 0 ? slug : `${slug}-${n}`)
    }
    for (const id of line.matchAll(/<a\s[^>]*(?:id|name)="([^"]+)"/g)) {
      anchors.add(id[1])
    }
  }
  anchorCache.set(path, anchors)
  return anchors
}

// Inline `[text](target "title")` and reference definitions `[label]: target`.
const INLINE_LINK = /\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const REF_DEF = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function targetsOf(text) {
  const clean = stripCode(text)
  const found = []
  for (const re of [INLINE_LINK, REF_DEF]) {
    for (const m of clean.matchAll(re)) {
      const line = clean.slice(0, m.index).split("\n").length
      found.push({ raw: m[1].replace(/^<|>$/g, ""), line })
    }
  }
  return found
}

const errors = []

for (const file of docFiles()) {
  const abs = resolve(REPO_ROOT, file)
  for (const { raw, line } of targetsOf(readFileSync(abs, "utf8"))) {
    if (!raw || SCHEME.test(raw) || raw.startsWith("//")) continue
    const hash = raw.indexOf("#")
    const pathPart = hash === -1 ? raw : raw.slice(0, hash)
    const anchor = hash === -1 ? "" : raw.slice(hash + 1)
    let targetPath
    try {
      targetPath = pathPart ? resolve(dirname(abs), decodeURI(pathPart)) : abs
      if (pathPart.startsWith("/")) {
        targetPath = resolve(REPO_ROOT, "." + decodeURI(pathPart))
      }
    } catch {
      errors.push(`${file}:${line}: malformed link "${raw}"`)
      continue
    }
    if (!existsSync(targetPath)) {
      errors.push(`${file}:${line}: missing file "${raw}"`)
      continue
    }
    if (anchor && targetPath.endsWith(".md") && statSync(targetPath).isFile()) {
      let wanted
      try {
        wanted = decodeURIComponent(anchor).toLowerCase()
      } catch {
        wanted = anchor.toLowerCase()
      }
      if (!anchorsOf(targetPath).has(wanted)) {
        errors.push(
          `${file}:${line}: missing anchor "#${anchor}" in ${relative(REPO_ROOT, targetPath)}`,
        )
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`check-docs: ${errors.length} problem(s)\n`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
console.log("check-docs: all relative links and anchors resolve")
