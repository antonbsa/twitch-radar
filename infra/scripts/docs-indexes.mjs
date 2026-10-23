#!/usr/bin/env node
/**
 * Validates the frontmatter of every ADR and TN and keeps their README indexes
 * generated from it (ADR 0065).
 *
 * Usage:
 *   node infra/scripts/docs-indexes.mjs          write the indexes between the marker comments
 *   import { checkDocsIndexes } from "./docs-indexes.mjs"   used by check-docs.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..")
const START = "<!-- docs-index:start -->"
const END = "<!-- docs-index:end -->"

const AREAS = [
  "platform",
  "auth",
  "monitoring",
  "notifications",
  "web",
  "operations",
  "testing",
  "delivery",
  "process",
]
const KINDS = {
  adr: {
    label: "ADR",
    dir: "docs/decisions",
    statuses: ["Proposed", "Accepted", "Rejected", "Superseded"],
    areas: true,
  },
  tn: {
    label: "TN",
    dir: "docs/notes",
    statuses: [
      "Informational",
      "Explored, not adopted",
      "Deferred",
      "Superseded",
    ],
    areas: false,
  },
}
// Relation key -> [inverse key, label shown in the index]
const RELATIONS = {
  supersedes: ["superseded-by", "supersedes"],
  "superseded-by": ["supersedes", "superseded by"],
  amends: ["amended-by", "amends"],
  "amended-by": ["amends", "amended by"],
}
const KNOWN_KEYS = new Set([
  "status",
  "area",
  "related",
  ...Object.keys(RELATIONS),
])

/** @returns {{kind: string, id: string, file: string, title: string, meta: object, prose: string, problems: string[]}[]} */
function loadRecords(kind) {
  const { dir } = KINDS[kind]
  return readdirSync(resolve(REPO_ROOT, dir))
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()
    .map((name) => {
      const file = `${dir}/${name}`
      const text = readFileSync(resolve(REPO_ROOT, file), "utf8")
      const problems = []
      const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
      let meta = {}
      if (!fm) problems.push("missing YAML frontmatter")
      else {
        try {
          meta = parse(fm[1]) ?? {}
        } catch (e) {
          problems.push(`invalid YAML frontmatter: ${e.message}`)
        }
      }
      const title = text.match(/^# \d{4} - (.+)$/m)?.[1]
      if (!title) problems.push('missing "# NNNN - Title" heading')
      const prose =
        text
          .match(/^## Status\s+([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]
          .trim() ?? ""
      return {
        kind,
        id: name.slice(0, 4),
        file,
        title: title ?? name,
        meta,
        prose,
        problems,
      }
    })
}

/** Relation targets as written in frontmatter: bare ids for same-kind relations, "ADR NNNN"/"TN NNNN" for `related`. */
function targetOf(record, key, value) {
  if (key === "related") return value
  return `${KINDS[record.kind].label} ${value}`
}

function loadAll() {
  return Object.keys(KINDS).flatMap(loadRecords)
}

function validate(records) {
  const byRef = new Map(
    records.map((r) => [`${KINDS[r.kind].label} ${r.id}`, r]),
  )
  const errors = []
  const fail = (r, msg) => errors.push(`${r.file}: ${msg}`)
  for (const r of records) {
    for (const p of r.problems) fail(r, p)
    if (r.problems.length) continue
    const { statuses, areas } = KINDS[r.kind]
    const { status, area } = r.meta
    if (!statuses.includes(status))
      fail(r, `status "${status}" must be one of: ${statuses.join(", ")}`)
    else if (!new RegExp(`^${status}(?![A-Za-z])`).test(r.prose)) {
      fail(
        r,
        `frontmatter status "${status}" does not start the "## Status" prose`,
      )
    }
    if (areas && !AREAS.includes(area))
      fail(r, `area "${area}" must be one of: ${AREAS.join(", ")}`)
    if (!areas && area !== undefined) fail(r, "TNs take no area")
    for (const key of Object.keys(r.meta))
      if (!KNOWN_KEYS.has(key)) fail(r, `unknown frontmatter key "${key}"`)
    for (const key of [...Object.keys(RELATIONS), "related"]) {
      const values = r.meta[key]
      if (values === undefined) continue
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some((v) => typeof v !== "string")
      ) {
        fail(
          r,
          `${key} must be a non-empty list of quoted strings (omit it when empty)`,
        )
        continue
      }
      for (const v of values) {
        const ref = targetOf(r, key, v)
        const other = byRef.get(ref)
        if (!other) {
          fail(r, `${key} ${v}: no such record`)
          continue
        }
        const inverse = key === "related" ? "related" : RELATIONS[key][0]
        const back = other.meta[inverse]
        if (
          !Array.isArray(back) ||
          !back.includes(
            key === "related" ? `${KINDS[r.kind].label} ${r.id}` : r.id,
          )
        ) {
          fail(r, `${key} ${v}: ${other.file} lacks the inverse (${inverse})`)
        }
      }
    }
    if (status === "Superseded" && !r.meta["superseded-by"])
      fail(r, "status Superseded needs superseded-by")
  }
  return errors
}

function line(r) {
  const parts = [
    `[${r.id} — ${r.title}](${r.file.split("/").pop()})`,
    r.meta.status,
  ]
  for (const key of [...Object.keys(RELATIONS), "related"]) {
    const values = r.meta[key]
    if (values)
      parts.push(
        `${key === "related" ? "see" : RELATIONS[key][1]} ${values.join(", ")}`,
      )
  }
  return `- ${parts.join(" · ")}`
}

function renderBlock(kind) {
  const records = loadRecords(kind)
  if (!KINDS[kind].areas) return records.map(line).join("\n")
  return AREAS.map((area) => {
    const group = records.filter((r) => r.meta.area === area)
    return group.length
      ? `### ${area[0].toUpperCase()}${area.slice(1)}\n\n${group.map(line).join("\n")}`
      : ""
  })
    .filter(Boolean)
    .join("\n\n")
}

function readmeWith(kind, block) {
  const path = resolve(REPO_ROOT, KINDS[kind].dir, "README.md")
  const text = readFileSync(path, "utf8")
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  if (start === -1 || end === -1 || end < start)
    return { path, text, next: null }
  return {
    path,
    text,
    next: `${text.slice(0, start + START.length)}\n\n${block}\n\n${text.slice(end)}`,
  }
}

/** @returns {string[]} problems: frontmatter errors and indexes that differ from the generator's output */
export function checkDocsIndexes() {
  const errors = validate(loadAll())
  if (errors.length) return errors
  for (const kind of Object.keys(KINDS)) {
    const { path, text, next } = readmeWith(kind, renderBlock(kind))
    const rel = path.slice(REPO_ROOT.length + 1)
    if (next === null) errors.push(`${rel}: missing ${START} / ${END} markers`)
    else if (next !== text)
      errors.push(`${rel}: generated index is stale, run "npm run docs:index"`)
  }
  return errors
}

function writeIndexes() {
  const errors = validate(loadAll())
  if (errors.length) return errors
  for (const kind of Object.keys(KINDS)) {
    const { path, next } = readmeWith(kind, renderBlock(kind))
    if (next === null) errors.push(`${path}: missing ${START} / ${END} markers`)
    else writeFileSync(path, next)
  }
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = writeIndexes()
  if (errors.length) {
    console.error(`docs-indexes: ${errors.length} problem(s)\n`)
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log("docs-indexes: indexes written")
}
