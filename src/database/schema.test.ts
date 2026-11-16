import { afterEach, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import schema from "./schema.sql?raw";
import { splitSqlStatements } from "../utils/sql";

const wasmUrl = new URL("../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url).pathname;

describe("pawn ledger database safeguards", () => {
  let database: Awaited<ReturnType<typeof openDatabase>> | undefined;

  async function openDatabase() {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const db = new SQL.Database();
    const statements = splitSqlStatements(schema);
    for (const [index, statement] of statements.entries()) {
      try {
        db.run(statement);
      } catch (error) {
        throw new Error(`Invalid SQLite schema statement ${index + 1}: ${JSON.stringify(statement)}`, { cause: error });
      }
    }
    return db;
  }

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it("audits updates and rejects deleting a ticket with payment history", async () => {
    database = await openDatabase();
    database.run("INSERT INTO customers VALUES ('c1','CUS-1','Customer','9876543210','','','2026-01-01')");
    database.run("INSERT INTO pawn_tickets (id,receipt_no,customer_id,jewellery_type,purity,gross_weight,stone_weight,loan_paise,annual_rate_bps,pawn_date,maturity_date,created_at) VALUES ('t1','SV-1001','c1','Chain','22K',10,0,10000,1600,'2026-01-01','2026-04-01','2026-01-01')");
    database.run("UPDATE customers SET name='Updated' WHERE id='c1'");
    database.run("UPDATE pawn_tickets SET notes='Edited' WHERE id='t1'");
    database.run("INSERT INTO payments (id,transaction_no,ticket_id,amount_paise,interest_paise,principal_paise,closes_ticket,method,paid_at) VALUES ('p1','TX-1','t1',10000,0,10000,1,'Cash','2026-01-02')");

    expect(database.exec("SELECT status FROM pawn_tickets WHERE id='t1'")[0].values[0][0]).toBe("redeemed");
    expect(database.exec("SELECT action FROM audit_logs WHERE action='ticket.redeemed'")).toHaveLength(1);
    expect(() => database?.run("DELETE FROM pawn_tickets WHERE id='t1'")).toThrow();
    expect(database.exec("SELECT COUNT(*) FROM sync_queue WHERE table_name='pawn_tickets' AND operation='upsert'")[0].values[0][0]).toBe(2);
    expect(Number(database.exec("SELECT COUNT(*) FROM sync_queue WHERE table_name='audit_logs'")[0].values[0][0])).toBeGreaterThan(0);
  });

  it("does not allow closing a ticket without paying its principal balance", async () => {
    database = await openDatabase();
    database.run("INSERT INTO customers VALUES ('c1','CUS-1','Customer','9876543210','','','2026-01-01')");
    database.run("INSERT INTO pawn_tickets (id,receipt_no,customer_id,jewellery_type,purity,gross_weight,stone_weight,loan_paise,annual_rate_bps,pawn_date,maturity_date,created_at) VALUES ('t1','SV-1001','c1','Chain','22K',10,0,10000,1600,'2026-01-01','2026-04-01','2026-01-01')");

    expect(() => database?.run("INSERT INTO payments (id,transaction_no,ticket_id,amount_paise,interest_paise,principal_paise,closes_ticket,method,paid_at) VALUES ('p1','TX-1','t1',5000,0,5000,1,'Cash','2026-01-02')")).toThrow();
    expect(database.exec("SELECT status FROM pawn_tickets WHERE id='t1'")[0].values[0][0]).toBe("active");
  });
});
