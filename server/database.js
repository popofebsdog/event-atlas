import { DatabaseSync } from "node:sqlite";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const value = (parameter) =>
  parameter instanceof ArrayBuffer ? new Uint8Array(parameter) : parameter;

// Both runtimes execute the same parameterized API queries and atomic batches.
class Statement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters.map(value);
  }
  bind(...parameters) {
    return new Statement(this.database, this.sql, parameters);
  }
  async first() {
    return this.database.prepare(this.sql).get(...this.parameters) ?? null;
  }
  async all() {
    return { results: this.database.prepare(this.sql).all(...this.parameters) };
  }
  runSync() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
  async run() {
    return this.runSync();
  }
}

export async function openDatabase(filename) {
  if (filename !== ":memory:")
    await mkdir(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  try {
    database.exec(
      "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;",
    );
    database.exec(
      "CREATE TABLE IF NOT EXISTS atlas_migrations (name TEXT PRIMARY KEY)",
    );
    for (const name of (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        database
          .prepare("SELECT name FROM atlas_migrations WHERE name=?")
          .get(name)
      )
        continue;
      const sql = await readFile(join(migrationsDirectory, name), "utf8");
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec(sql);
        database
          .prepare("INSERT INTO atlas_migrations (name) VALUES (?)")
          .run(name);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
    return {
      prepare: (sql) => new Statement(database, sql),
      async batch(statements) {
        database.exec("BEGIN IMMEDIATE");
        try {
          const results = statements.map((statement) => statement.runSync());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      },
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
