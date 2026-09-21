import { describe, expect, it } from "vitest"
import { parseChangelog } from "../../../apps/web/src/lib/changelog-parser"

describe("parseChangelog", () => {
  it("should parse version heading, date, and categorized items", () => {
    const markdown = `# Changelog

## v0.2.0 — 2026-09-10

### Migrations & Config

- feat: add a migration

### Features

- feat: add a feature with \`inline code\`

### Fixes

- fix: fix a bug

### Docs & Decisions

- docs: write a doc

### Other Changes

- chore: tidy up
`

    const versions = parseChangelog(markdown)

    expect(versions).toEqual([
      {
        version: "v0.2.0",
        date: "2026-09-10",
        categories: {
          migrations: ["feat: add a migration"],
          features: ["feat: add a feature with `inline code`"],
          fixes: ["fix: fix a bug"],
          docs: ["docs: write a doc"],
          other: ["chore: tidy up"],
        },
      },
    ])
  })

  it("should parse multiple versions in file order", () => {
    const markdown = `## v0.2.0 — 2026-09-10

### Features

- feat: newer thing

## v0.1.0 — 2026-08-01

### Features

- feat: older thing
`

    const versions = parseChangelog(markdown)

    expect(versions.map((v) => v.version)).toEqual(["v0.2.0", "v0.1.0"])
    expect(versions[0].categories.features).toEqual(["feat: newer thing"])
    expect(versions[1].categories.features).toEqual(["feat: older thing"])
  })

  it("should ignore an Unreleased section", () => {
    const markdown = `## Unreleased

### Features

- feat: not shipped yet

## v0.1.0 — 2026-08-01

### Features

- feat: shipped
`

    const versions = parseChangelog(markdown)

    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe("v0.1.0")
  })

  it("should return an empty category for a version with no items in it", () => {
    const markdown = `## v0.1.0 — 2026-08-01

### Features

- feat: only this one
`

    const versions = parseChangelog(markdown)

    expect(versions[0].categories.fixes).toEqual([])
    expect(versions[0].categories.migrations).toEqual([])
  })

  it("should return an empty list for malformed or empty content", () => {
    expect(parseChangelog("")).toEqual([])
    expect(parseChangelog("just some prose, no headings")).toEqual([])
    expect(parseChangelog("## not a version heading at all")).toEqual([])
  })

  it("should ignore an unrecognized category heading", () => {
    const markdown = `## v0.1.0 — 2026-08-01

### Something Else

- this should not appear anywhere

### Features

- feat: this should
`

    const versions = parseChangelog(markdown)

    expect(versions[0].categories.features).toEqual(["feat: this should"])
  })
})
