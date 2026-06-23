import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { schema } from "./schema";

export type AppDatabase = DrizzleD1Database<typeof schema>;

export function createDatabaseClient(db: D1Database): AppDatabase {
  return drizzle(db, { schema });
}
