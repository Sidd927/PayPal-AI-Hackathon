/**
 * SQLite persistence (better-sqlite3, synchronous, single file).
 *
 * PayPal is the system of record for invoices and money; this database holds Unstuck's own state:
 * mirrored invoice snapshots, client messages, AI diagnoses, proposed/executed actions, plans and the audit log.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { ActionStatus, ActionType, Installment, PolicyCheck, PolicyDecisionKind, StuckReason } from "./domain";
import { DEFAULT_POLICY, type Policy, PolicySchema } from "./policy";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  due_minor INTEGER NOT NULL,
  invoice_date TEXT,
  due_date TEXT,
  recipient_name TEXT,
  recipient_business TEXT,
  recipient_email TEXT,
  reference TEXT,
  partial_allowed INTEGER NOT NULL DEFAULT 0,
  min_due_minor INTEGER,
  recipient_view_url TEXT,
  payer_token TEXT UNIQUE NOT NULL,
  disputed INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('client','owner','agent','system')),
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_invoice ON messages(invoice_id, id);
CREATE TABLE IF NOT EXISTS diagnoses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  recommendation_json TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  input_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ai_status TEXT,
  ai_detail TEXT,
  ai_attempted_at TEXT
);
CREATE INDEX IF NOT EXISTS diagnoses_invoice ON diagnoses(invoice_id, id);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  type TEXT NOT NULL,
  params_json TEXT NOT NULL,
  origin TEXT NOT NULL,
  rationale TEXT NOT NULL,
  decision TEXT NOT NULL,
  decision_reasons_json TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  paid_minor_before INTEGER,
  diagnosis_id INTEGER,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS actions_invoice ON actions(invoice_id, created_at);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  installments_json TEXT NOT NULL,
  paid_minor_at_start INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  installments_json TEXT NOT NULL,
  status TEXT NOT NULL,
  action_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  invoice_id TEXT,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  verified INTEGER NOT NULL,
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS sim_invoices (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT
);
CREATE TABLE IF NOT EXISTS agent_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  at TEXT NOT NULL,
  invoice_id TEXT,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_steps_run ON agent_steps(run_id, id);
`;

type DB = Database.Database;
const g = globalThis as unknown as { __unstuckDb?: DB };

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive, idempotent column migrations for databases created by earlier versions. */
function migrate(db: DB) {
  const have = new Set((db.prepare("PRAGMA table_info(diagnoses)").all() as { name: string }[]).map((c) => c.name));
  for (const col of ["ai_status", "ai_detail", "ai_attempted_at"]) {
    if (!have.has(col)) db.exec(`ALTER TABLE diagnoses ADD COLUMN ${col} TEXT`);
  }
}

export function getDb(): DB {
  // Default lives under node_modules/.cache: shared by dev, `next start` and the seed scripts, and outside the
  // dev server's file watcher (a DB inside the watched tree made Fast Refresh reload in a loop on every read).
  if (!g.__unstuckDb) g.__unstuckDb = openDb(process.env.DATABASE_PATH || path.join(process.cwd(), "node_modules", ".cache", "unstuck", "unstuck.db"));
  return g.__unstuckDb;
}

/** Test hook: replace the singleton (e.g. with an in-memory database). */
export function setDb(db: DB) {
  g.__unstuckDb = db;
}

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const newToken = () => randomBytes(18).toString("base64url");

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */

export type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  total_minor: number;
  paid_minor: number;
  due_minor: number;
  invoice_date: string | null;
  due_date: string | null;
  recipient_name: string | null;
  recipient_business: string | null;
  recipient_email: string | null;
  reference: string | null;
  partial_allowed: number;
  min_due_minor: number | null;
  recipient_view_url: string | null;
  payer_token: string;
  disputed: number;
  raw_json: string;
  first_seen_at: string;
  synced_at: string;
};

export type MessageRow = { id: number; invoice_id: string; author: "client" | "owner" | "agent" | "system"; channel: string; body: string; created_at: string };

export type DiagnosisRow = {
  id: number;
  invoice_id: string;
  reason: StuckReason;
  confidence: number;
  summary: string;
  evidence_json: string;
  extracted_json: string;
  recommendation_json: string;
  source: "ai" | "rules";
  model: string | null;
  input_hash: string;
  created_at: string;
  /** How the AI took part (AiStatus in ai/diagnosis.ts); null on rows written before this was recorded. */
  ai_status: "used" | "not_configured" | "budget_exhausted" | "failed" | "unusable" | null;
  /** Short reason when the AI wasn't used. */
  ai_detail: string | null;
  /** Last time an AI diagnosis was attempted for these inputs (updated by retries that keep this row). */
  ai_attempted_at: string | null;
};

export type ActionRow = {
  id: string;
  invoice_id: string;
  type: ActionType;
  params_json: string;
  origin: string;
  rationale: string;
  decision: PolicyDecisionKind;
  decision_reasons_json: string;
  checks_json: string;
  status: ActionStatus;
  result_json: string | null;
  error: string | null;
  paid_minor_before: number | null;
  diagnosis_id: number | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
};

export type PlanRow = { id: string; invoice_id: string; action_id: string; installments_json: string; paid_minor_at_start: number; status: "active" | "completed" | "cancelled"; created_at: string };
export type OfferRow = { id: string; invoice_id: string; installments_json: string; status: "open" | "accepted" | "pending_owner" | "superseded"; action_id: string | null; created_at: string };
export type AgentRunRow = { id: string; trigger: string; status: "running" | "completed" | "failed"; started_at: string; finished_at: string | null; summary_json: string | null };
export type AgentStepRow = { id: number; run_id: string; at: string; invoice_id: string | null; kind: string; label: string; detail: string | null; status: "ok" | "info" | "warn" | "error" | "skip" };
export type EventRow = { id: number; at: string; invoice_id: string | null; kind: string; actor: string; summary: string; data_json: string | null };

/* ------------------------------------------------------------------ */
/* Repositories                                                        */
/* ------------------------------------------------------------------ */

export const repo = {
  /* invoices */
  upsertInvoice(row: Omit<InvoiceRow, "payer_token" | "first_seen_at" | "disputed"> & { payer_token?: string }) {
    const db = getDb();
    const existing = db.prepare("SELECT payer_token, first_seen_at, disputed FROM invoices WHERE id = ?").get(row.id) as
      | Pick<InvoiceRow, "payer_token" | "first_seen_at" | "disputed">
      | undefined;
    const full: InvoiceRow = {
      ...row,
      payer_token: existing?.payer_token ?? row.payer_token ?? newToken(),
      first_seen_at: existing?.first_seen_at ?? nowIso(),
      disputed: existing?.disputed ?? 0,
    };
    db.prepare(
      `INSERT INTO invoices (id, number, status, currency, total_minor, paid_minor, due_minor, invoice_date, due_date, recipient_name, recipient_business, recipient_email, reference, partial_allowed, min_due_minor, recipient_view_url, payer_token, disputed, raw_json, first_seen_at, synced_at)
       VALUES (@id, @number, @status, @currency, @total_minor, @paid_minor, @due_minor, @invoice_date, @due_date, @recipient_name, @recipient_business, @recipient_email, @reference, @partial_allowed, @min_due_minor, @recipient_view_url, @payer_token, @disputed, @raw_json, @first_seen_at, @synced_at)
       ON CONFLICT(id) DO UPDATE SET number=excluded.number, status=excluded.status, currency=excluded.currency, total_minor=excluded.total_minor, paid_minor=excluded.paid_minor, due_minor=excluded.due_minor, invoice_date=excluded.invoice_date, due_date=excluded.due_date, recipient_name=excluded.recipient_name, recipient_business=excluded.recipient_business, recipient_email=excluded.recipient_email, reference=excluded.reference, partial_allowed=excluded.partial_allowed, min_due_minor=excluded.min_due_minor, recipient_view_url=excluded.recipient_view_url, raw_json=excluded.raw_json, synced_at=excluded.synced_at`,
    ).run(full);
    return full;
  },
  getInvoice(id: string) {
    return getDb().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as InvoiceRow | undefined;
  },
  getInvoiceByToken(token: string) {
    return getDb().prepare("SELECT * FROM invoices WHERE payer_token = ?").get(token) as InvoiceRow | undefined;
  },
  listInvoices() {
    return getDb().prepare("SELECT * FROM invoices ORDER BY due_date ASC").all() as InvoiceRow[];
  },
  setDisputed(id: string, disputed: boolean) {
    getDb().prepare("UPDATE invoices SET disputed = ? WHERE id = ?").run(disputed ? 1 : 0, id);
  },

  /* messages */
  addMessage(m: Omit<MessageRow, "id" | "created_at"> & { created_at?: string }) {
    const r = getDb()
      .prepare("INSERT INTO messages (invoice_id, author, channel, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(m.invoice_id, m.author, m.channel, m.body, m.created_at ?? nowIso());
    return Number(r.lastInsertRowid);
  },
  listMessages(invoiceId: string) {
    return getDb().prepare("SELECT * FROM messages WHERE invoice_id = ? ORDER BY created_at ASC, id ASC").all(invoiceId) as MessageRow[];
  },

  /* diagnoses */
  addDiagnosis(d: Omit<DiagnosisRow, "id" | "created_at" | "ai_attempted_at">) {
    const now = nowIso();
    const r = getDb()
      .prepare(
        "INSERT INTO diagnoses (invoice_id, reason, confidence, summary, evidence_json, extracted_json, recommendation_json, source, model, input_hash, created_at, ai_status, ai_detail, ai_attempted_at) VALUES (@invoice_id, @reason, @confidence, @summary, @evidence_json, @extracted_json, @recommendation_json, @source, @model, @input_hash, @created_at, @ai_status, @ai_detail, @ai_attempted_at)",
      )
      .run({ ...d, created_at: now, ai_attempted_at: d.ai_status === "not_configured" ? null : now });
    return Number(r.lastInsertRowid);
  },
  /** Record a failed AI retry on an existing rules diagnosis without replacing it (no new proposals). */
  recordAiAttempt(diagnosisId: number, ai: { status: DiagnosisRow["ai_status"]; detail: string | null }) {
    getDb().prepare("UPDATE diagnoses SET ai_status = ?, ai_detail = ?, ai_attempted_at = ? WHERE id = ?").run(ai.status, ai.detail, nowIso(), diagnosisId);
  },
  latestDiagnosis(invoiceId: string) {
    return getDb().prepare("SELECT * FROM diagnoses WHERE invoice_id = ? ORDER BY id DESC LIMIT 1").get(invoiceId) as DiagnosisRow | undefined;
  },

  /* actions */
  insertAction(a: Omit<ActionRow, "created_at" | "decided_at" | "executed_at" | "result_json" | "error"> & { result_json?: string | null }) {
    getDb()
      .prepare(
        `INSERT INTO actions (id, invoice_id, type, params_json, origin, rationale, decision, decision_reasons_json, checks_json, status, result_json, error, paid_minor_before, diagnosis_id, created_at)
         VALUES (@id, @invoice_id, @type, @params_json, @origin, @rationale, @decision, @decision_reasons_json, @checks_json, @status, @result_json, NULL, @paid_minor_before, @diagnosis_id, @created_at)`,
      )
      .run({ result_json: null, ...a, created_at: nowIso() });
  },
  getAction(id: string) {
    return getDb().prepare("SELECT * FROM actions WHERE id = ?").get(id) as ActionRow | undefined;
  },
  listActions(filter: { invoiceId?: string; status?: ActionStatus } = {}) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter.invoiceId) (where.push("invoice_id = ?"), args.push(filter.invoiceId));
    if (filter.status) (where.push("status = ?"), args.push(filter.status));
    return getDb()
      .prepare(`SELECT * FROM actions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`)
      .all(...args) as ActionRow[];
  },
  /** Atomically move an action from one status to another. Returns false if it was not in `from`. */
  transitionAction(id: string, from: ActionStatus[], to: ActionStatus, patch: Partial<Pick<ActionRow, "result_json" | "error" | "params_json" | "paid_minor_before" | "decision" | "decision_reasons_json" | "checks_json">> = {}) {
    const ts = nowIso();
    const r = getDb()
      .prepare(
        `UPDATE actions SET status = @to,
           result_json = COALESCE(@result_json, result_json), error = @error,
           params_json = COALESCE(@params_json, params_json), paid_minor_before = COALESCE(@paid_minor_before, paid_minor_before),
           decision = COALESCE(@decision, decision), decision_reasons_json = COALESCE(@decision_reasons_json, decision_reasons_json), checks_json = COALESCE(@checks_json, checks_json),
           decided_at = CASE WHEN @to IN ('approved','rejected') THEN @ts ELSE decided_at END,
           executed_at = CASE WHEN @to IN ('executed','failed') THEN @ts ELSE executed_at END
         WHERE id = @id AND status IN (${from.map((_, i) => `@f${i}`).join(",")})`,
      )
      .run({
        id,
        to,
        ts,
        result_json: patch.result_json ?? null,
        error: patch.error ?? null,
        params_json: patch.params_json ?? null,
        paid_minor_before: patch.paid_minor_before ?? null,
        decision: patch.decision ?? null,
        decision_reasons_json: patch.decision_reasons_json ?? null,
        checks_json: patch.checks_json ?? null,
        ...Object.fromEntries(from.map((f, i) => [`f${i}`, f])),
      });
    return r.changes === 1;
  },
  /** Once an action of a given type has run, older pending proposals of that type are moot. */
  supersedeSameType(invoiceId: string, type: ActionType, exceptId: string) {
    getDb().prepare("UPDATE actions SET status = 'rejected', error = 'Superseded: this was already done' WHERE invoice_id = ? AND type = ? AND id != ? AND status = 'proposed'").run(invoiceId, type, exceptId);
  },
  supersedeProposals(invoiceId: string) {
    getDb().prepare("UPDATE actions SET status = 'rejected', error = 'Superseded by a newer diagnosis' WHERE invoice_id = ? AND status = 'proposed' AND origin = 'agent'").run(invoiceId);
  },

  /* plans */
  insertPlan(p: Omit<PlanRow, "created_at">) {
    getDb().prepare("UPDATE plans SET status = 'cancelled' WHERE invoice_id = ? AND status = 'active'").run(p.invoice_id);
    getDb()
      .prepare("INSERT INTO plans (id, invoice_id, action_id, installments_json, paid_minor_at_start, status, created_at) VALUES (@id, @invoice_id, @action_id, @installments_json, @paid_minor_at_start, @status, @created_at)")
      .run({ ...p, created_at: nowIso() });
  },
  activePlan(invoiceId: string) {
    return getDb().prepare("SELECT * FROM plans WHERE invoice_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(invoiceId) as PlanRow | undefined;
  },
  latestPlan(invoiceId: string) {
    return getDb().prepare("SELECT * FROM plans WHERE invoice_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1").get(invoiceId) as PlanRow | undefined;
  },
  setPlanStatus(id: string, status: PlanRow["status"]) {
    getDb().prepare("UPDATE plans SET status = ? WHERE id = ?").run(status, id);
  },

  /* offers */
  insertOffer(invoiceId: string, installments: Installment[]) {
    const id = newId("off");
    getDb()
      .prepare("INSERT INTO offers (id, invoice_id, installments_json, status, action_id, created_at) VALUES (?, ?, ?, 'open', NULL, ?)")
      .run(id, invoiceId, JSON.stringify(installments), nowIso());
    return id;
  },
  getOffer(id: string) {
    return getDb().prepare("SELECT * FROM offers WHERE id = ?").get(id) as OfferRow | undefined;
  },
  listOffers(invoiceId: string) {
    return getDb().prepare("SELECT * FROM offers WHERE invoice_id = ? ORDER BY created_at ASC").all(invoiceId) as OfferRow[];
  },
  setOfferStatus(id: string, status: OfferRow["status"], actionId?: string) {
    getDb().prepare("UPDATE offers SET status = ?, action_id = COALESCE(?, action_id) WHERE id = ?").run(status, actionId ?? null, id);
  },

  /* events (audit log) */
  logEvent(e: { invoice_id?: string | null; kind: string; actor: string; summary: string; data?: unknown; at?: string }) {
    getDb()
      .prepare("INSERT INTO events (at, invoice_id, kind, actor, summary, data_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(e.at ?? nowIso(), e.invoice_id ?? null, e.kind, e.actor, e.summary, e.data === undefined ? null : JSON.stringify(e.data));
  },
  listEvents(filter: { invoiceId?: string; limit?: number } = {}) {
    const lim = filter.limit ?? 300;
    if (filter.invoiceId) return getDb().prepare("SELECT * FROM events WHERE invoice_id = ? ORDER BY id DESC LIMIT ?").all(filter.invoiceId, lim) as EventRow[];
    return getDb().prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(lim) as EventRow[];
  },

  /* settings */
  getPolicy(): Policy {
    const row = getDb().prepare("SELECT value_json FROM settings WHERE key = 'policy'").get() as { value_json: string } | undefined;
    if (!row) return DEFAULT_POLICY;
    const parsed = PolicySchema.safeParse(JSON.parse(row.value_json));
    return parsed.success ? parsed.data : DEFAULT_POLICY;
  },
  setPolicy(p: Policy) {
    getDb().prepare("INSERT INTO settings (key, value_json) VALUES ('policy', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(JSON.stringify(p));
  },
  getSetting<T>(key: string): T | undefined {
    const row = getDb().prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  },
  setSetting(key: string, value: unknown) {
    getDb().prepare("INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(key, JSON.stringify(value));
  },

  /* webhooks */
  /** Returns false if the event id was already recorded (duplicate delivery). */
  recordWebhook(id: string, type: string, verified: boolean) {
    const r = getDb().prepare("INSERT OR IGNORE INTO webhook_events (id, event_type, received_at, verified, outcome) VALUES (?, ?, ?, ?, NULL)").run(id, type, nowIso(), verified ? 1 : 0);
    return r.changes === 1;
  },
  /** Allow a redelivery to be processed after a failed attempt. */
  forgetWebhook(id: string) {
    getDb().prepare("DELETE FROM webhook_events WHERE id = ?").run(id);
  },
  setWebhookOutcome(id: string, outcome: string) {
    getDb().prepare("UPDATE webhook_events SET outcome = ? WHERE id = ?").run(outcome, id);
  },

  /* agent runs */
  startRun(trigger: string) {
    const id = newId("run");
    getDb().prepare("INSERT INTO agent_runs (id, trigger, status, started_at) VALUES (?, ?, 'running', ?)").run(id, trigger, nowIso());
    return id;
  },
  finishRun(id: string, status: "completed" | "failed", summary: unknown) {
    getDb().prepare("UPDATE agent_runs SET status = ?, finished_at = ?, summary_json = ? WHERE id = ?").run(status, nowIso(), JSON.stringify(summary), id);
  },
  addStep(runId: string, s: { invoice_id?: string | null; kind: string; label: string; detail?: string; status: "ok" | "info" | "warn" | "error" | "skip" }) {
    getDb().prepare("INSERT INTO agent_steps (run_id, at, invoice_id, kind, label, detail, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run(runId, nowIso(), s.invoice_id ?? null, s.kind, s.label, s.detail ?? null, s.status);
  },
  latestRun() {
    return getDb().prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 1").get() as AgentRunRow | undefined;
  },
  getRun(id: string) {
    return getDb().prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRunRow | undefined;
  },
  listSteps(runId: string) {
    return getDb().prepare("SELECT * FROM agent_steps WHERE run_id = ? ORDER BY id ASC").all(runId) as AgentStepRow[];
  },

  /** Wipe all Unstuck state (demo reset). */
  resetAll() {
    getDb().exec("DELETE FROM invoices; DELETE FROM messages; DELETE FROM diagnoses; DELETE FROM actions; DELETE FROM plans; DELETE FROM offers; DELETE FROM events; DELETE FROM webhook_events; DELETE FROM sim_invoices; DELETE FROM agent_runs; DELETE FROM agent_steps; DELETE FROM settings WHERE key != 'policy';");
  },
};
