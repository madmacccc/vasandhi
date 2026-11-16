PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  customer_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  id_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);

CREATE TABLE IF NOT EXISTS pawn_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  jewellery_type TEXT NOT NULL,
  purity TEXT NOT NULL CHECK (purity IN ('24K','22K','20K','18K')),
  gross_weight REAL NOT NULL CHECK (gross_weight >= 0),
  stone_weight REAL NOT NULL CHECK (stone_weight >= 0 AND stone_weight <= gross_weight),
  loan_paise INTEGER NOT NULL CHECK (loan_paise > 0),
  annual_rate_bps INTEGER NOT NULL CHECK (annual_rate_bps >= 0),
  approximate_value_paise INTEGER NOT NULL DEFAULT 0 CHECK (approximate_value_paise >= 0),
  declared_monthly_income_paise INTEGER NOT NULL DEFAULT 0 CHECK (declared_monthly_income_paise >= 0),
  signature_ciphertext TEXT,
  pawn_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON pawn_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON pawn_tickets(status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_no TEXT NOT NULL UNIQUE,
  ticket_id TEXT NOT NULL REFERENCES pawn_tickets(id) ON DELETE RESTRICT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  interest_paise INTEGER NOT NULL CHECK (interest_paise >= 0),
  principal_paise INTEGER NOT NULL CHECK (principal_paise >= 0),
  closes_ticket INTEGER NOT NULL DEFAULT 0 CHECK (closes_ticket IN (0, 1)),
  method TEXT NOT NULL CHECK (method IN ('Cash','UPI','Other')),
  paid_at TEXT NOT NULL,
  CHECK (interest_paise + principal_paise = amount_paise)
);
CREATE INDEX IF NOT EXISTS idx_payments_ticket_date ON payments(ticket_id, paid_at);

CREATE TABLE IF NOT EXISTS shop_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  default_rate_bps INTEGER NOT NULL CHECK (default_rate_bps >= 0),
  interest_method TEXT NOT NULL CHECK (interest_method IN ('daily','monthly','annual')),
  day_count_basis INTEGER NOT NULL CHECK (day_count_basis IN (360,365)),
  currency TEXT NOT NULL DEFAULT 'INR'
);
INSERT OR IGNORE INTO shop_settings (id, name, default_rate_bps, interest_method, day_count_basis, currency)
VALUES (1, 'Golden Ledger Pawn Shop', 1600, 'daily', 365, 'INR');

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS customer_insert_sync
AFTER INSERT ON customers
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'upsert',
    json_object('id', NEW.id, 'customerNo', NEW.customer_no, 'name', NEW.name,
      'mobile', NEW.mobile, 'address', NEW.address, 'createdAt', NEW.created_at),
    NEW.created_at);
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'customer.created', 'customer', NEW.id, NEW.customer_no, NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS customer_update_sync
AFTER UPDATE ON customers
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'upsert',
    json_object('id', NEW.id, 'customerNo', NEW.customer_no, 'name', NEW.name,
      'mobile', NEW.mobile, 'address', NEW.address, 'createdAt', NEW.created_at),
    datetime('now'));
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'customer.updated', 'customer', NEW.id, NEW.customer_no, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS ticket_insert_sync
AFTER INSERT ON pawn_tickets
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'pawn_tickets', NEW.id, 'upsert',
    json_object('id', NEW.id, 'receiptNo', NEW.receipt_no, 'customerId', NEW.customer_id,
      'jewelleryType', NEW.jewellery_type, 'purity', NEW.purity, 'grossWeight', NEW.gross_weight,
      'stoneWeight', NEW.stone_weight, 'loanPaise', NEW.loan_paise, 'annualRateBps', NEW.annual_rate_bps,
      'approximateValuePaise', NEW.approximate_value_paise,
      'declaredMonthlyIncomePaise', NEW.declared_monthly_income_paise,
      'signatureCiphertext', NEW.signature_ciphertext,
      'pawnDate', NEW.pawn_date, 'maturityDate', NEW.maturity_date, 'notes', NEW.notes,
      'status', NEW.status, 'createdAt', NEW.created_at),
    NEW.created_at);
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'ticket.created', 'pawn_ticket', NEW.id, NEW.receipt_no, NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS ticket_update_sync
AFTER UPDATE ON pawn_tickets
WHEN OLD.receipt_no IS NOT NEW.receipt_no OR OLD.customer_id IS NOT NEW.customer_id OR
  OLD.jewellery_type IS NOT NEW.jewellery_type OR OLD.purity IS NOT NEW.purity OR
  OLD.gross_weight IS NOT NEW.gross_weight OR OLD.stone_weight IS NOT NEW.stone_weight OR
  OLD.loan_paise IS NOT NEW.loan_paise OR OLD.annual_rate_bps IS NOT NEW.annual_rate_bps OR
  OLD.approximate_value_paise IS NOT NEW.approximate_value_paise OR
  OLD.declared_monthly_income_paise IS NOT NEW.declared_monthly_income_paise OR
  OLD.signature_ciphertext IS NOT NEW.signature_ciphertext OR OLD.pawn_date IS NOT NEW.pawn_date OR
  OLD.maturity_date IS NOT NEW.maturity_date OR OLD.notes IS NOT NEW.notes
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'pawn_tickets', NEW.id, 'upsert',
    json_object('id', NEW.id, 'receiptNo', NEW.receipt_no, 'customerId', NEW.customer_id,
      'jewelleryType', NEW.jewellery_type, 'purity', NEW.purity, 'grossWeight', NEW.gross_weight,
      'stoneWeight', NEW.stone_weight, 'loanPaise', NEW.loan_paise, 'annualRateBps', NEW.annual_rate_bps,
      'approximateValuePaise', NEW.approximate_value_paise,
      'declaredMonthlyIncomePaise', NEW.declared_monthly_income_paise,
      'signatureCiphertext', NEW.signature_ciphertext,
      'pawnDate', NEW.pawn_date, 'maturityDate', NEW.maturity_date, 'notes', NEW.notes,
      'status', NEW.status, 'createdAt', NEW.created_at),
    datetime('now'));
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'ticket.updated', 'pawn_ticket', NEW.id, NEW.receipt_no, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS ticket_status_audit
AFTER UPDATE OF status ON pawn_tickets
WHEN OLD.status != NEW.status
BEGIN
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'ticket.redeemed', 'pawn_ticket', NEW.id, NEW.receipt_no, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS ticket_delete_sync
AFTER DELETE ON pawn_tickets
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'pawn_tickets', OLD.id, 'delete', '{}', datetime('now'));
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'ticket.deleted', 'pawn_ticket', OLD.id, OLD.receipt_no, datetime('now'));
END;

CREATE TRIGGER IF NOT EXISTS audit_insert_sync
AFTER INSERT ON audit_logs
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'audit_logs', NEW.id, 'upsert',
  json_object('id', NEW.id, 'action', NEW.action, 'entityType', NEW.entity_type,
    'entityId', NEW.entity_id, 'details', NEW.details, 'createdAt', NEW.created_at),
  NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS payment_validate
BEFORE INSERT ON payments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pawn_tickets WHERE id = NEW.ticket_id AND status = 'active'
  ) THEN RAISE(ABORT, 'This ticket is not active.') END;
  SELECT CASE WHEN NEW.closes_ticket = 1 AND NEW.principal_paise != (
    SELECT loan_paise - COALESCE(SUM(principal_paise), 0)
    FROM pawn_tickets LEFT JOIN payments ON payments.ticket_id = pawn_tickets.id
    WHERE pawn_tickets.id = NEW.ticket_id
  ) THEN RAISE(ABORT, 'Principal balance must be paid before closing the ticket.') END;
END;

CREATE TRIGGER IF NOT EXISTS payment_insert_sync
AFTER INSERT ON payments
BEGIN
  INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
  VALUES (lower(hex(randomblob(16))), 'payments', NEW.id, 'upsert',
    json_object('id', NEW.id, 'transactionNo', NEW.transaction_no, 'ticketId', NEW.ticket_id,
      'amountPaise', NEW.amount_paise, 'interestPaise', NEW.interest_paise,
      'principalPaise', NEW.principal_paise, 'method', NEW.method, 'paidAt', NEW.paid_at),
    NEW.paid_at);
  INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
  VALUES (lower(hex(randomblob(16))), 'payment.created', 'payment', NEW.id, NEW.transaction_no, NEW.paid_at);
  UPDATE pawn_tickets SET status = 'redeemed'
  WHERE id = NEW.ticket_id AND NEW.closes_ticket = 1 AND status = 'active';
END;

