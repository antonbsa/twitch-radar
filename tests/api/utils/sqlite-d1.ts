import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type StatementSync, type SQLInputValue } from "node:sqlite";

type D1Value = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

class SqliteD1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: D1Value[] = []
  ) {}

  bind(...values: D1Value[]): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.db, this.sql, values);
  }

  async first<T = unknown>(columnName?: string): Promise<T | null> {
    const row = this.statement().get(...this.sqliteValues()) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    if (columnName) {
      return (row[columnName] ?? null) as T;
    }

    return row as T;
  }

  async run(): Promise<D1Result> {
    const result = this.statement().run(...this.sqliteValues());
    const changes = Number(result.changes);
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        changes,
        last_row_id: Number(result.lastInsertRowid),
        changed_db: true,
        size_after: 0,
        rows_read: 0,
        rows_written: changes
      }
    };
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const results = this.statement().all(...this.sqliteValues()) as T[];
    return {
      results,
      success: true,
      meta: {
        duration: 0,
        changes: 0,
        last_row_id: 0,
        changed_db: false,
        size_after: 0,
        rows_read: results.length,
        rows_written: 0
      }
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const rows = this.statement().all(...this.sqliteValues()) as Record<string, unknown>[];
    return rows.map((row) => Object.keys(row).map((key) => row[key]) as T);
  }

  private statement(): StatementSync {
    return this.db.prepare(this.sql);
  }

  private sqliteValues(): SQLInputValue[] {
    return this.values.map((value) => {
      if (typeof value === "boolean") {
        return value ? 1 : 0;
      }

      if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
      }

      return value as SQLInputValue;
    });
  }
}

export class SqliteD1Database {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql: string): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, sql);
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.sqlite.exec(sql);
    return {
      count: 0,
      duration: 0
    };
  }

  async batch<T = unknown>(statements: SqliteD1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const statement of statements) {
      results.push((await statement.run()) as D1Result<T>);
    }
    return results;
  }

  close(): void {
    this.sqlite.close();
  }
}

export async function createMigratedD1(): Promise<D1Database> {
  const db = new SqliteD1Database();
  const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../infra/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    await db.exec(readFileSync(resolve(migrationsDir, migrationFile), "utf8"));
  }

  return db as unknown as D1Database;
}
