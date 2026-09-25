import { describe, expect, it } from "vitest"
import { parseChangelog } from "../../../apps/web/src/lib/changelog-parser"

describe("parseChangelog", () => {
  it("should parse version heading, date, summary, and sections", () => {
    const markdown = `# Changelog

## v0.2.0 — 2026-09-10

A short summary
spanning two lines.

### New

- Added a feature with \`inline code\`

### Improved

- Made something faster

### Fixed

- Fixed a bug
`

    const versions = parseChangelog(markdown)

    expect(versions).toEqual([
      {
        version: "v0.2.0",
        date: "2026-09-10",
        summary: "A short summary spanning two lines.",
        sections: {
          new: ["Added a feature with `inline code`"],
          improved: ["Made something faster"],
          fixed: ["Fixed a bug"],
        },
      },
    ])
  })

  it("should parse multiple versions in file order", () => {
    const markdown = `## v0.2.0 — 2026-09-10

### New

- Newer thing

## v0.1.0 — 2026-08-01

### New

- Older thing
`

    const versions = parseChangelog(markdown)

    expect(versions.map((v) => v.version)).toEqual(["v0.2.0", "v0.1.0"])
    expect(versions[0].sections.new).toEqual(["Newer thing"])
    expect(versions[1].sections.new).toEqual(["Older thing"])
  })

  it("should ignore an Unreleased section", () => {
    const markdown = `## Unreleased

### New

- Not shipped yet

## v0.1.0 — 2026-08-01

### New

- Shipped
`

    const versions = parseChangelog(markdown)

    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe("v0.1.0")
  })

  it("should return empty sections and summary when a version has none", () => {
    const markdown = `## v0.1.0 — 2026-08-01

### Fixed

- Only this one
`

    const versions = parseChangelog(markdown)

    expect(versions[0].summary).toBe("")
    expect(versions[0].sections.new).toEqual([])
    expect(versions[0].sections.improved).toEqual([])
  })

  it("should return an empty list for malformed or empty content", () => {
    expect(parseChangelog("")).toEqual([])
    expect(parseChangelog("just some prose, no headings")).toEqual([])
    expect(parseChangelog("## not a version heading at all")).toEqual([])
  })

  it("should ignore an unrecognized section, including its prose", () => {
    const markdown = `## v0.1.0 — 2026-08-01

### Something Else

Prose that is not the summary.

- this should not appear anywhere

### New

- This should
`

    const versions = parseChangelog(markdown)

    expect(versions[0].summary).toBe("")
    expect(versions[0].sections.new).toEqual(["This should"])
  })
})
