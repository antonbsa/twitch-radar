import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import { schema } from "./schema"

export type AppDatabase = DrizzleD1Database<typeof schema>

export function createDatabaseClient(d1: D1Database): AppDatabase {
  return drizzle(d1, { schema })
}

/**
 * `AppDatabase["batch"]` requires a non-empty tuple type (`[U, ...U[]]`),
 * not a plain array, per drizzle-orm's d1 session typings — a dynamically
 * built `T[]` doesn't structurally satisfy that on its own. Callers must
 * still guard the empty-input case themselves (as every `upsertAll`/
 * `ensurePending` here already does) before calling this; `db.batch([])`
 * is both a type error and a runtime no-op that isn't worth reaching for.
 */
export function asBatch<T>(statements: T[]): [T, ...T[]] {
  return statements as [T, ...T[]]
}
