import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./sql";

describe("SQLite schema statement splitting", () => {
  it("preserves the final character before a statement terminator", () => {
    expect(splitSqlStatements("CREATE TABLE sample (id TEXT);")).toEqual([
      "CREATE TABLE sample (id TEXT)",
    ]);
  });

  it("keeps trigger bodies, CASE expressions and quoted semicolons intact", () => {
    const sql = `
      CREATE TABLE sample (value TEXT);
      CREATE TRIGGER sample_insert AFTER INSERT ON sample
      BEGIN
        SELECT CASE WHEN NEW.value = 'a;b' THEN 1 ELSE 0 END;
        UPDATE sample SET value = value WHERE rowid = NEW.rowid;
      END;
      CREATE INDEX sample_value ON sample(value);
    `;
    expect(splitSqlStatements(sql)).toHaveLength(3);
    expect(splitSqlStatements(sql)[1]).toContain("UPDATE sample");
    expect(splitSqlStatements(sql)[1]).toContain("'a;b'");
  });
});
