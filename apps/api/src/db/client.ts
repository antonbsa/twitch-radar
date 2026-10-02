import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import { schema } from "./schema"

export type AppDatabase = DrizzleD1Database<typeof schema>

export function createDatabaseClient(d1: D1Database): AppDatabase {
  return drizzle(d1, { schema })
}

/**
 * Callers must skip empty input; the cast only satisfies drizzle's non-empty
 * tuple type for `batch`.
 */
export function asBatch<T>(statements: T[]): [T, ...T[]] {
  return statements as [T, ...T[]]
}
