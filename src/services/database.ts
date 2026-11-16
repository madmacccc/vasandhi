import Database from "@tauri-apps/plugin-sql";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import schema from "../database/schema.sql?raw";
import type { Customer, LedgerData, Payment, PaymentMethod, PawnTicket, ShopSettings } from "../types";
import { readBrowserValue, writeBrowserValue } from "./browserStorage";
import { requireSupabase } from "./supabase";
import { splitSqlStatements } from "../utils/sql";

const defaultSettings: ShopSettings = {
  name: "Golden Ledger Pawn Shop",
  defaultRateBps: 1600,
  interestMethod: "daily",
  dayCountBasis: 365,
  currency: "INR",
};

type SqlValue = string | number | null | Uint8Array;
interface LedgerDatabase {
  execute(query: string, values?: SqlValue[]): Promise<unknown>;
  select<T extends unknown[]>(query: string, values?: SqlValue[]): Promise<T>;
}

class BrowserSqlite implements LedgerDatabase {
  private queue = Promise.resolve();
  private sqlite: SqlJsDatabase;
  private transactionSnapshot?: Uint8Array;

  private constructor(sqlite: SqlJsDatabase) {
    this.sqlite = sqlite;
  }

  static async open(): Promise<BrowserSqlite> {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const data = await readBrowserValue<Uint8Array>("databases", "ledger.sqlite");
    return new BrowserSqlite(data ? new SQL.Database(data) : new SQL.Database());
  }

  execute(query: string, values: SqlValue[] = []): Promise<unknown> {
    return this.serial(async () => {
      const statement = query.trim().replace(/;+$/, "").trim();
      if (/^BEGIN\b/i.test(statement)) {
        const snapshot = this.sqlite.export();
        this.sqlite.run(query, values);
        this.transactionSnapshot = snapshot;
        return { rowsAffected: 0 };
      }
      if (/^COMMIT\b/i.test(statement)) {
        this.sqlite.run(query, values);
        if (this.transactionSnapshot) {
          const snapshot = this.transactionSnapshot;
          try {
            await this.persist();
            this.transactionSnapshot = undefined;
          } catch (error) {
            await this.restore(snapshot);
            this.transactionSnapshot = undefined;
            throw error;
          }
        }
        return { rowsAffected: this.sqlite.getRowsModified() };
      }
      if (/^ROLLBACK\b/i.test(statement)) {
        this.sqlite.run(query, values);
        this.transactionSnapshot = undefined;
        return { rowsAffected: 0 };
      }
      if (this.transactionSnapshot) {
        this.sqlite.run(query, values);
        return { rowsAffected: this.sqlite.getRowsModified() };
      }
      const before = this.sqlite.export();
      this.sqlite.run(query, values);
      try {
        await this.persist();
      } catch (error) {
        await this.restore(before);
        throw error;
      }
      return { rowsAffected: this.sqlite.getRowsModified() };
    });
  }

  select<T extends unknown[]>(query: string, values: SqlValue[] = []): Promise<T> {
    return this.serial(async () => {
      const results = this.sqlite.exec(query, values);
      const result = results[0];
      if (!result) return [] as unknown as T;
      return result.values.map((row) =>
        Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
      ) as T;
    });
  }

  private persist(): Promise<void> {
    return writeBrowserValue("databases", "ledger.sqlite", this.sqlite.export());
  }

  private async restore(snapshot: Uint8Array): Promise<void> {
    this.sqlite.close();
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    this.sqlite = new SQL.Database(snapshot);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

let connection: Promise<LedgerDatabase> | undefined;
let cloudContext: { shopId: string; userId: string } | undefined;

export async function setCloudContext(context?: { shopId: string; userId: string }, persist = true): Promise<void> {
  cloudContext = context;
  if (!persist && !context) return;
  const db = await database();
  await db.execute("DELETE FROM cloud_context");
  if (context) {
    await db.execute("INSERT INTO cloud_context (id, shop_id, user_id) VALUES (1, ?, ?)", [context.shopId, context.userId]);
  }
}

export async function getCachedCloudContext(userId?: string): Promise<{ shopId: string; userId: string } | undefined> {
  const db = await database();
  const [cached] = userId
    ? await db.select<Array<{ shopId: string; userId: string }>>(
      "SELECT shop_id AS shopId, user_id AS userId FROM cloud_context WHERE id = 1 AND user_id = ?",
      [userId],
    )
    : await db.select<Array<{ shopId: string; userId: string }>>(
      "SELECT shop_id AS shopId, user_id AS userId FROM cloud_context WHERE id = 1",
    );
  return cached;
}

async function prepareSchema(db: LedgerDatabase): Promise<void> {
  await db.execute("CREATE TABLE IF NOT EXISTS cloud_context (id INTEGER PRIMARY KEY CHECK (id = 1), shop_id TEXT NOT NULL, user_id TEXT NOT NULL)");
  const statements = splitSqlStatements(schema);
  for (const statement of statements.filter((sql) => !/^CREATE\s+TRIGGER\b/i.test(sql))) {
    await db.execute(statement);
  }
  const ticketColumns = await db.select<Array<{ name: string }>>("PRAGMA table_info(pawn_tickets)");
  const existingColumns = new Set(ticketColumns.map((column) => column.name));
  if (!existingColumns.has("approximate_value_paise")) {
    await db.execute("ALTER TABLE pawn_tickets ADD COLUMN approximate_value_paise INTEGER NOT NULL DEFAULT 0 CHECK (approximate_value_paise >= 0)");
  }
  if (!existingColumns.has("declared_monthly_income_paise")) {
    await db.execute("ALTER TABLE pawn_tickets ADD COLUMN declared_monthly_income_paise INTEGER NOT NULL DEFAULT 0 CHECK (declared_monthly_income_paise >= 0)");
  }
  if (!existingColumns.has("signature_ciphertext")) {
    await db.execute("ALTER TABLE pawn_tickets ADD COLUMN signature_ciphertext TEXT");
  }
  await db.execute("DROP TRIGGER IF EXISTS ticket_insert_sync");
  await db.execute("DROP TRIGGER IF EXISTS customer_update_sync");
  await db.execute("DROP TRIGGER IF EXISTS ticket_update_sync");
  await db.execute("DROP TRIGGER IF EXISTS ticket_delete_sync");
  await db.execute("DROP TRIGGER IF EXISTS ticket_status_sync");
  await db.execute("DROP TRIGGER IF EXISTS ticket_status_audit");
  for (const statement of statements.filter((sql) => /^CREATE\s+TRIGGER\b/i.test(sql))) {
    await db.execute(statement);
  }
}

async function database(): Promise<LedgerDatabase> {
  if ("__TAURI_INTERNALS__" in window) {
    connection ??= Database.load("sqlite:gold-pawn-pro.db").then(async (db) => {
      await prepareSchema(db);
      return db;
    });
  } else {
    connection ??= BrowserSqlite.open().then(async (db) => {
      await prepareSchema(db);
      return db;
    });
  }
  return connection;
}

async function rollbackAndRethrow(db: LedgerDatabase, error: unknown): Promise<never> {
  try {
    await db.execute("ROLLBACK");
  } catch (rollbackError) {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    throw new Error(`${originalMessage}; transaction rollback also failed: ${rollbackMessage}`);
  }
  throw error;
}

async function fetchAllPages<T>(
  getPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getPage(from, from + 999);
    if (error) throw error;
    if (!data) throw new Error("Supabase returned an empty page response.");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export function createId(): string {
  return crypto.randomUUID();
}

export async function loadLedger(): Promise<LedgerData> {
  const db = await database();
  const [customers, tickets, payments, settings] = await Promise.all([
    db.select<Customer[]>("SELECT id, customer_no AS customerNo, name, mobile, address, id_reference AS idReference, created_at AS createdAt FROM customers ORDER BY created_at DESC"),
    db.select<PawnTicket[]>("SELECT id, receipt_no AS receiptNo, customer_id AS customerId, jewellery_type AS jewelleryType, purity, gross_weight AS grossWeight, stone_weight AS stoneWeight, loan_paise AS loanPaise, annual_rate_bps AS annualRateBps, approximate_value_paise AS approximateValuePaise, declared_monthly_income_paise AS declaredMonthlyIncomePaise, signature_ciphertext AS signatureCiphertext, pawn_date AS pawnDate, maturity_date AS maturityDate, notes, status, created_at AS createdAt FROM pawn_tickets ORDER BY created_at DESC"),
    db.select<Payment[]>("SELECT id, transaction_no AS transactionNo, ticket_id AS ticketId, amount_paise AS amountPaise, interest_paise AS interestPaise, principal_paise AS principalPaise, method, paid_at AS paidAt FROM payments ORDER BY paid_at DESC"),
    db.select<Array<{ name: string; defaultRateBps: number; interestMethod: ShopSettings["interestMethod"]; dayCountBasis: 360 | 365; currency: string }>>("SELECT name, default_rate_bps AS defaultRateBps, interest_method AS interestMethod, day_count_basis AS dayCountBasis, currency FROM shop_settings WHERE id = 1"),
  ]);
  return { customers, tickets, payments, settings: settings[0] ?? defaultSettings };
}

export async function saveCustomer(customer: Customer): Promise<void> {
  const db = await database();
  await db.execute(
    "INSERT INTO customers (id,customer_no,name,mobile,address,id_reference,created_at) VALUES (?,?,?,?,?,?,?)",
    [customer.id, customer.customerNo, customer.name, customer.mobile, customer.address, customer.idReference, customer.createdAt],
  );
}

export async function updateCustomer(customer: Customer): Promise<void> {
  const db = await database();
  await db.execute(
    "UPDATE customers SET name = ?, mobile = ?, address = ?, id_reference = ? WHERE id = ?",
    [customer.name, customer.mobile, customer.address, customer.idReference, customer.id],
  );
}

export async function saveTicket(ticket: PawnTicket): Promise<void> {
  const db = await database();
  await db.execute(
    "INSERT INTO pawn_tickets (id,receipt_no,customer_id,jewellery_type,purity,gross_weight,stone_weight,loan_paise,annual_rate_bps,approximate_value_paise,declared_monthly_income_paise,signature_ciphertext,pawn_date,maturity_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [ticket.id, ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, ticket.status, ticket.createdAt],
  );
}

export async function savePawnRecord(customer: Customer, ticket: PawnTicket, existingCustomer = false): Promise<void> {
  const db = await database();
  await db.execute("BEGIN");
  try {
    if (existingCustomer) {
      await db.execute(
        "UPDATE customers SET name = ?, mobile = ?, address = ? WHERE id = ?",
        [customer.name, customer.mobile, customer.address, customer.id],
      );
    } else {
      await db.execute(
        "INSERT INTO customers (id,customer_no,name,mobile,address,id_reference,created_at) VALUES (?,?,?,?,?,?,?)",
        [customer.id, customer.customerNo, customer.name, customer.mobile, customer.address, customer.idReference, customer.createdAt],
      );
    }
    await db.execute(
      "INSERT INTO pawn_tickets (id,receipt_no,customer_id,jewellery_type,purity,gross_weight,stone_weight,loan_paise,annual_rate_bps,approximate_value_paise,declared_monthly_income_paise,signature_ciphertext,pawn_date,maturity_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [ticket.id, ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, ticket.status, ticket.createdAt],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAndRethrow(db, error);
  }
}

export async function updateTicket(ticket: PawnTicket): Promise<void> {
  const db = await database();
  await db.execute(
    "UPDATE pawn_tickets SET receipt_no = ?, customer_id = ?, jewellery_type = ?, purity = ?, gross_weight = ?, stone_weight = ?, loan_paise = ?, annual_rate_bps = ?, approximate_value_paise = ?, declared_monthly_income_paise = ?, signature_ciphertext = ?, pawn_date = ?, maturity_date = ?, notes = ? WHERE id = ? AND status = 'active'",
    [ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, ticket.id],
  );
}

export async function updatePawnRecord(customer: Customer, ticket: PawnTicket): Promise<void> {
  const db = await database();
  await db.execute("BEGIN");
  try {
    await db.execute(
      "UPDATE customers SET name = ?, mobile = ?, address = ? WHERE id = ?",
      [customer.name, customer.mobile, customer.address, customer.id],
    );
    await db.execute(
      "UPDATE pawn_tickets SET receipt_no = ?, customer_id = ?, jewellery_type = ?, purity = ?, gross_weight = ?, stone_weight = ?, loan_paise = ?, annual_rate_bps = ?, approximate_value_paise = ?, declared_monthly_income_paise = ?, signature_ciphertext = ?, pawn_date = ?, maturity_date = ?, notes = ? WHERE id = ? AND status = 'active'",
      [ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, ticket.id],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAndRethrow(db, error);
  }
}

export async function deleteTicket(ticketId: string): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM pawn_tickets WHERE id = ? AND status = 'active'", [ticketId]);
}

export async function savePayment(payment: Payment, redeem: boolean): Promise<void> {
  const db = await database();
  await db.execute(
    "INSERT INTO payments (id,transaction_no,ticket_id,amount_paise,interest_paise,principal_paise,closes_ticket,method,paid_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [payment.id, payment.transactionNo, payment.ticketId, payment.amountPaise, payment.interestPaise, payment.principalPaise, redeem ? 1 : 0, payment.method, payment.paidAt],
  );
}

export async function restoreLedger(backup: LedgerData): Promise<void> {
  const db = await database();
  const counts = await db.select<Array<{ count: number }>>(
    "SELECT (SELECT COUNT(*) FROM customers) + (SELECT COUNT(*) FROM pawn_tickets) + (SELECT COUNT(*) FROM payments) AS count",
  );
  if ((counts[0]?.count ?? 0) !== 0) throw new Error("Ledger must be empty before restoring a backup.");

  await db.execute("BEGIN");
  try {
    for (const customer of backup.customers) {
      await db.execute(
        "INSERT INTO customers (id,customer_no,name,mobile,address,id_reference,created_at) VALUES (?,?,?,?,?,?,?)",
        [customer.id, customer.customerNo, customer.name, customer.mobile, customer.address, customer.idReference, customer.createdAt],
      );
    }
    for (const ticket of backup.tickets) {
      await db.execute(
        "INSERT INTO pawn_tickets (id,receipt_no,customer_id,jewellery_type,purity,gross_weight,stone_weight,loan_paise,annual_rate_bps,approximate_value_paise,declared_monthly_income_paise,signature_ciphertext,pawn_date,maturity_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [ticket.id, ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, "active", ticket.createdAt],
      );
    }
    const closingPaymentIds = new Set<string>();
    for (const ticket of backup.tickets.filter((item) => item.status === "redeemed")) {
      let principalPaid = 0;
      const closingPayment = backup.payments
        .filter((payment) => payment.ticketId === ticket.id)
        .sort((left, right) => left.paidAt.localeCompare(right.paidAt))
        .find((payment) => {
          principalPaid += payment.principalPaise;
          return principalPaid === ticket.loanPaise;
        });
      if (!closingPayment) throw new Error(`Backup has no full-principal settlement for redeemed ticket ${ticket.receiptNo}.`);
      closingPaymentIds.add(closingPayment.id);
    }
    for (const payment of [...backup.payments].sort((left, right) => left.paidAt.localeCompare(right.paidAt))) {
      await db.execute(
        "INSERT INTO payments (id,transaction_no,ticket_id,amount_paise,interest_paise,principal_paise,closes_ticket,method,paid_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [payment.id, payment.transactionNo, payment.ticketId, payment.amountPaise, payment.interestPaise, payment.principalPaise, closingPaymentIds.has(payment.id) ? 1 : 0, payment.method, payment.paidAt],
      );
    }
    for (const ticket of backup.tickets.filter((item) => item.status === "redeemed")) {
      await db.execute("UPDATE pawn_tickets SET status = 'redeemed' WHERE id = ?", [ticket.id]);
    }
    await db.execute(
      "UPDATE shop_settings SET name = ?, default_rate_bps = ?, interest_method = ?, day_count_basis = ?, currency = ? WHERE id = 1",
      [backup.settings.name, backup.settings.defaultRateBps, backup.settings.interestMethod, backup.settings.dayCountBasis, backup.settings.currency],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAndRethrow(db, error);
  }
}

export async function syncCloudLedger(): Promise<void> {
  const context = cloudContext;
  if (!context) throw new Error("Sign in to sync this ledger with Supabase.");
  const client = requireSupabase();
  const db = await database();
  const pending = await db.select<Array<{
    id: string;
    table_name: string;
    record_id: string;
    operation: "upsert" | "delete";
  }>>(
    "SELECT q.id, q.table_name, q.record_id, q.operation FROM sync_queue q LEFT JOIN pawn_tickets t ON q.table_name = 'pawn_tickets' AND q.record_id = t.id ORDER BY CASE WHEN q.table_name = 'customers' THEN 0 WHEN q.table_name = 'pawn_tickets' AND t.status = 'active' THEN 1 WHEN q.table_name = 'payments' THEN 2 WHEN q.table_name = 'pawn_tickets' THEN 3 WHEN q.table_name = 'audit_logs' THEN 4 ELSE 5 END, q.created_at, q.id",
  );

  for (const change of pending) {
    if (change.operation === "delete") {
      if (change.table_name !== "pawn_tickets") {
        throw new Error(`Unsupported queued delete for ${change.table_name}.`);
      }
      const { error } = await client.from("pawn_tickets")
        .delete().eq("id", change.record_id).eq("shop_id", context.shopId);
      if (error) throw error;
    } else if (change.table_name === "customers") {
      const [customer] = await db.select<Array<{
        id: string; customer_no: string; name: string; mobile: string; address: string;
        id_reference: string; created_at: string;
      }>>("SELECT id, customer_no, name, mobile, address, id_reference, created_at FROM customers WHERE id = ?", [change.record_id]);
      if (customer) {
        const { error } = await client.from("customers").upsert({
          id: customer.id,
          shop_id: context.shopId,
          customer_no: customer.customer_no,
          name: customer.name,
          mobile: customer.mobile,
          address: customer.address,
          id_reference: customer.id_reference,
          created_at: customer.created_at,
        }, { onConflict: "id" });
        if (error) throw error;
      }
    } else if (change.table_name === "pawn_tickets") {
      const [ticket] = await db.select<Array<{
        id: string; receipt_no: string; customer_id: string; jewellery_type: string; purity: string;
        gross_weight: number; stone_weight: number; loan_paise: number; annual_rate_bps: number;
        approximate_value_paise: number; declared_monthly_income_paise: number;
        signature_ciphertext: string | null; pawn_date: string; maturity_date: string; notes: string;
        status: "active" | "redeemed"; created_at: string;
      }>>(
        "SELECT id, receipt_no, customer_id, jewellery_type, purity, gross_weight, stone_weight, loan_paise, annual_rate_bps, approximate_value_paise, declared_monthly_income_paise, signature_ciphertext, pawn_date, maturity_date, notes, status, created_at FROM pawn_tickets WHERE id = ?",
        [change.record_id],
      );
      if (ticket) {
        const { error } = await client.from("pawn_tickets").upsert({
          ...ticket,
          shop_id: context.shopId,
          created_by: context.userId,
        }, { onConflict: "id" });
        if (error) throw error;
      }
    } else if (change.table_name === "payments") {
      const [payment] = await db.select<Array<{
        id: string; transaction_no: string; ticket_id: string; amount_paise: number;
        interest_paise: number; principal_paise: number; closes_ticket: number;
        method: PaymentMethod; paid_at: string;
      }>>(
        "SELECT id, transaction_no, ticket_id, amount_paise, interest_paise, principal_paise, closes_ticket, method, paid_at FROM payments WHERE id = ?",
        [change.record_id],
      );
      if (payment) {
        let uploadedTicketFromCache = false;
        const { data: cloudTicket, error: lookupError } = await client.from("pawn_tickets")
          .select("id").eq("id", payment.ticket_id).eq("shop_id", context.shopId).maybeSingle();
        if (lookupError) throw lookupError;
        if (!cloudTicket) {
          const [ticket] = await db.select<Array<{
            id: string; receipt_no: string; customer_id: string; jewellery_type: string; purity: string;
            gross_weight: number; stone_weight: number; loan_paise: number; annual_rate_bps: number;
            approximate_value_paise: number; declared_monthly_income_paise: number;
            signature_ciphertext: string | null; pawn_date: string; maturity_date: string; notes: string;
            created_at: string;
          }>>(
            "SELECT id, receipt_no, customer_id, jewellery_type, purity, gross_weight, stone_weight, loan_paise, annual_rate_bps, approximate_value_paise, declared_monthly_income_paise, signature_ciphertext, pawn_date, maturity_date, notes, created_at FROM pawn_tickets WHERE id = ?",
            [payment.ticket_id],
          );
          if (!ticket) throw new Error(`Missing local ticket ${payment.ticket_id} for queued payment.`);
          const { error } = await client.from("pawn_tickets").upsert({
            ...ticket, shop_id: context.shopId, created_by: context.userId, status: "active",
          }, { onConflict: "id" });
          if (error) throw error;
          uploadedTicketFromCache = true;
        }
        const { error } = await client.rpc("record_payment", {
          p_id: payment.id,
          p_shop_id: context.shopId,
          p_transaction_no: payment.transaction_no,
          p_ticket_id: payment.ticket_id,
          p_amount_paise: payment.amount_paise,
          p_interest_paise: payment.interest_paise,
          p_principal_paise: payment.principal_paise,
          p_method: payment.method,
          p_paid_at: payment.paid_at,
          p_received_by: context.userId,
          p_redeem: payment.closes_ticket === 1,
        });
        if (error) throw error;
        if (payment.closes_ticket === 1 && uploadedTicketFromCache) {
          await db.execute("DELETE FROM sync_queue WHERE table_name = 'pawn_tickets' AND record_id = ?", [payment.ticket_id]);
        }
      }
    } else if (change.table_name === "audit_logs") {
      const [audit] = await db.select<Array<{
        id: string; action: string; entity_type: string; entity_id: string;
        details: string; created_at: string;
      }>>(
        "SELECT id, action, entity_type, entity_id, details, created_at FROM audit_logs WHERE id = ?",
        [change.record_id],
      );
      if (audit) {
        const { error } = await client.from("audit_logs").upsert({
          id: audit.id,
          shop_id: context.shopId,
          actor_id: context.userId,
          action: audit.action,
          entity_type: audit.entity_type,
          entity_id: audit.entity_id,
          details: { local_details: audit.details },
          created_at: audit.created_at,
        }, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      }
    } else {
      throw new Error(`Unsupported queued table ${change.table_name}.`);
    }

    await db.execute("DELETE FROM sync_queue WHERE id = ?", [change.id]);
  }

  const [customers, tickets, payments, settingsResult, shopResult] = await Promise.all([
    fetchAllPages(async (from, to) => await client.from("customers")
      .select("id, customer_no, name, mobile, address, id_reference, created_at")
      .eq("shop_id", context.shopId).order("created_at", { ascending: false }).range(from, to)),
    fetchAllPages(async (from, to) => await client.from("pawn_tickets")
      .select("id, receipt_no, customer_id, jewellery_type, purity, gross_weight, stone_weight, loan_paise, annual_rate_bps, approximate_value_paise, declared_monthly_income_paise, signature_ciphertext, pawn_date, maturity_date, notes, status, created_at")
      .eq("shop_id", context.shopId).order("created_at", { ascending: false }).range(from, to)),
    fetchAllPages(async (from, to) => await client.from("payments")
      .select("id, transaction_no, ticket_id, amount_paise, interest_paise, principal_paise, method, paid_at")
      .eq("shop_id", context.shopId).order("paid_at", { ascending: false }).range(from, to)),
    client.from("shop_settings")
      .select("default_rate_bps, interest_method, day_count_basis, currency")
      .eq("shop_id", context.shopId).maybeSingle(),
    client.from("shops").select("name").eq("id", context.shopId).single(),
  ]);
  for (const result of [settingsResult, shopResult]) {
    if (result.error) throw result.error;
  }
  const remoteShop = shopResult.data;
  if (!remoteShop) {
    throw new Error("Supabase returned incomplete ledger data.");
  }

  const localCustomers = customers.map((row) => ({
    id: row.id, customerNo: row.customer_no, name: row.name, mobile: row.mobile,
    address: row.address, idReference: row.id_reference, createdAt: row.created_at,
  }));
  const localTickets = tickets.map((row) => ({
    id: row.id, receiptNo: row.receipt_no, customerId: row.customer_id,
    jewelleryType: row.jewellery_type, purity: row.purity as PawnTicket["purity"],
    grossWeight: Number(row.gross_weight), stoneWeight: Number(row.stone_weight),
    loanPaise: Number(row.loan_paise), annualRateBps: row.annual_rate_bps,
    approximateValuePaise: Number(row.approximate_value_paise),
    declaredMonthlyIncomePaise: Number(row.declared_monthly_income_paise),
    signatureCiphertext: row.signature_ciphertext, pawnDate: row.pawn_date,
    maturityDate: row.maturity_date, notes: row.notes, status: row.status,
    createdAt: row.created_at,
  }));
  const localPayments = payments.map((row) => ({
    id: row.id, transactionNo: row.transaction_no, ticketId: row.ticket_id,
    amountPaise: Number(row.amount_paise), interestPaise: Number(row.interest_paise),
    principalPaise: Number(row.principal_paise), method: row.method, paidAt: row.paid_at,
  }));
  const remoteSettings = settingsResult.data;
  const settings: ShopSettings = {
    name: remoteShop.name,
    defaultRateBps: remoteSettings?.default_rate_bps ?? defaultSettings.defaultRateBps,
    interestMethod: remoteSettings?.interest_method ?? defaultSettings.interestMethod,
    dayCountBasis: remoteSettings?.day_count_basis === 360 ? 360 : 365,
    currency: remoteSettings?.currency ?? defaultSettings.currency,
  };

  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM payments");
    await db.execute("DELETE FROM pawn_tickets");
    await db.execute("DELETE FROM customers");
    for (const customer of localCustomers) {
      await db.execute(
        "INSERT INTO customers (id, customer_no, name, mobile, address, id_reference, created_at) VALUES (?,?,?,?,?,?,?)",
        [customer.id, customer.customerNo, customer.name, customer.mobile, customer.address, customer.idReference, customer.createdAt],
      );
    }
    for (const ticket of localTickets) {
      await db.execute(
        "INSERT INTO pawn_tickets (id, receipt_no, customer_id, jewellery_type, purity, gross_weight, stone_weight, loan_paise, annual_rate_bps, approximate_value_paise, declared_monthly_income_paise, signature_ciphertext, pawn_date, maturity_date, notes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [ticket.id, ticket.receiptNo, ticket.customerId, ticket.jewelleryType, ticket.purity, ticket.grossWeight, ticket.stoneWeight, ticket.loanPaise, ticket.annualRateBps, ticket.approximateValuePaise, ticket.declaredMonthlyIncomePaise, ticket.signatureCiphertext, ticket.pawnDate, ticket.maturityDate, ticket.notes, ticket.status, ticket.createdAt],
      );
    }
    for (const payment of localPayments) {
      await db.execute(
        "INSERT INTO payments (id, transaction_no, ticket_id, amount_paise, interest_paise, principal_paise, closes_ticket, method, paid_at) VALUES (?,?,?,?,?,?,0,?,?)",
        [payment.id, payment.transactionNo, payment.ticketId, payment.amountPaise, payment.interestPaise, payment.principalPaise, payment.method, payment.paidAt],
      );
    }
    await db.execute(
      "UPDATE shop_settings SET name = ?, default_rate_bps = ?, interest_method = ?, day_count_basis = ?, currency = ? WHERE id = 1",
      [settings.name, settings.defaultRateBps, settings.interestMethod, settings.dayCountBasis, settings.currency],
    );
    await db.execute("DELETE FROM sync_queue");
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackAndRethrow(db, error);
  }
}
