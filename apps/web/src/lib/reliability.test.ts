import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendApprovedEstimate, type EstimateRow, type EstimateStore } from "./leads/estimate-approval";
import { sendApprovedDraft } from "./assistant/send";
import { parseInbound } from "./assistant/inbound";
import { recordSignedReturn, verifySigned } from "./agreements/review";
import { sendRecordedEmail } from "./email/record";
import { POST as inboundPOST } from "../app/api/inbound/email/route";

// Reliability audit. Tests marked `todo` assert the DESIRED behaviour for a defect found in the audit: they fail today, do not
// fail the run, and will pass once the defect is fixed. Everything else here passes and guards behaviour that is already correct.
// Everything runs against in-memory stand-ins and a stubbed fetch: no database, no network, no real email.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

function fakeDb(seed: Tables, opts: { files?: Set<string> } = {}) {
  const t: Tables = { events: [], final_quotes: [], contacts: [], agreements: [], agreement_documents: [], projects: [], settings: [], assistant_knowledge: [], email_drafts: [], inbox_emails: [], conversations: [], messages: [], message_deliveries: [], ...seed };
  const failUpdate = new Set<string>();
  const files = opts.files ?? new Set<string>();
  const failInsert = new Set<string>();
  const from = (table: string) => {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let ins: Row[] = [];
    const filters: ((r: Row) => boolean)[] = [];
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      order: () => b,
      limit: () => b,
      update: (p: Row) => ((op = "update"), (patch = p), b),
      insert: (r: Row | Row[]) => ((op = "insert"), (ins = Array.isArray(r) ? r : [r]), b),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    async function run(): Promise<{ data?: Row[]; error?: { message: string; code?: string } }> {
      if (op === "insert") {
        if (failInsert.has(table)) return { error: { message: `${table}: insert failed` } };
        const made = ins.map((r) => ({ id: `${table}-${t[table].length + 1}`, ...r }));
        t[table].push(...made);
        return { data: made };
      }
      let hit = t[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        if (failUpdate.has(table)) return { error: { message: `${table}: update failed` } };
        for (const r of hit) Object.assign(r, patch);
        return { data: hit };
      }
      if (table === "email_drafts") hit = hit.map((d) => ({ ...d, inbox_emails: t.inbox_emails.find((e) => e.id === d.email_id) ?? null }));
      if (table === "agreements") hit = hit.map((a) => ({ ...a, agreement_documents: t.agreement_documents.filter((d) => d.agreement_id === a.id) }));
      if (table === "projects") hit = hit.map((p) => ({ ...p, contacts: null }));
      return { data: hit };
    }
    return b;
  };
  const storage = {
    from: () => ({
      upload: async (path: string) => {
        if (files.has(path)) return { error: new Error("The resource already exists") };
        files.add(path);
        return { error: null };
      },
    }),
  };
  return { db: { from, storage } as unknown as SupabaseClient, t, failUpdate, failInsert, files };
}

const realFetch = globalThis.fetch;
const saved = { ...process.env };
let calls: { url: string; body: Row }[] = [];
beforeEach(() => {
  calls = [];
  Object.assign(process.env, {
    EMAIL_SENDING_ENABLED: "true", RESEND_API_KEY: "test-key", EMAIL_FROM: "Smith Bros <noreply@example.test>", INBOX_ADDRESS: "shared@example.test",
    GMAIL_SEND_WEBHOOK_URL: "https://gmail-sender.example.test/send", GMAIL_SEND_SECRET: "test-secret",
  });
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "prov-1", threadId: "thr-1" }), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
});

// ---- Inbound webhook and parsing ----

const hook = (headers: Record<string, string>, body: unknown) =>
  inboundPOST(new NextRequest("http://localhost/api/inbound/email", { method: "POST", headers, body: JSON.stringify(body) }));

test("inbound webhook: wrong, missing or weak secret is refused before anything is read or stored", async () => {
  process.env.INBOUND_WEBHOOK_SECRET = "a-long-enough-shared-secret";
  assert.equal((await hook({}, {})).status, 401);
  assert.equal((await hook({ "x-webhook-secret": "wrong-secret-of-same-len!" }, {})).status, 401);
  process.env.INBOUND_WEBHOOK_SECRET = "short";
  assert.equal((await hook({ "x-webhook-secret": "short" }, {})).status, 401, "a weak configured secret never authorises");
  delete process.env.INBOUND_WEBHOOK_SECRET;
  assert.equal((await hook({ "x-webhook-secret": "" }, {})).status, 401, "no configured secret means closed, not open");
});

test("inbound webhook: valid secret, bad payload is a 400; mail from our own address is ignored without touching the database", async () => {
  process.env.INBOUND_WEBHOOK_SECRET = "a-long-enough-shared-secret";
  const h = { "x-webhook-secret": "a-long-enough-shared-secret" };
  assert.equal((await hook(h, { subject: "no id" })).status, 400);
  const r = await hook(h, { provider_message_id: "m1", from_address: "Shared@Example.test", received_at: "2026-10-01T00:00:00Z" });
  assert.deepEqual(await r.json(), { ok: true, ignored: "own address" });
});

test("inbound parsing: a sender is required, names and files are made safe, nothing is trusted from the sender", () => {
  assert.equal(parseInbound({ provider_message_id: "m", from_address: "not-an-address" }).ok, false);
  const p = parseInbound({ provider_message_id: "m", from: 'Ann Lee <ANN@Example.com>', attachments: [{ filename: "../../etc/passwd", content_type: "text/html", size: 5 }] });
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.value.from_address, "ann@example.com");
    assert.equal(p.value.attachments[0].filename, ".._.._etc_passwd");
  }
});

// ---- Agreement operations interrupted and repeated ----

const ag = (status: string, type = "work_contract") => ({
  agreements: [{ id: "a1", project_id: "p1", document_type: type, status }],
  projects: [{ id: "p1", contact_id: "c1", stage: "agreement_sent" }],
});
const pdf = Buffer.from("%PDF-1.4 test");

test("verification interrupted after the document was reviewed can be retried: one verified agreement, one history entry", async () => {
  const s = fakeDb({ ...ag("returned"), agreement_documents: [{ id: "d1", agreement_id: "a1", document_kind: "signed_return", revision_number: 1, verified_at: null }] });
  s.failUpdate.add("agreements");
  await assert.rejects(() => verifySigned(s.db, "u1", "a1", "checked"));
  assert.equal(s.t.agreements[0].status, "returned");
  s.failUpdate.clear();
  await verifySigned(s.db, "u1", "a1", "checked");
  await verifySigned(s.db, "u1", "a1", "checked");
  assert.equal(s.t.agreements[0].status, "verified");
  assert.equal(s.t.events.filter((e) => e.event_type === "agreement.verified").length, 1);
});

test("a signed copy is refused for a draft or cancelled agreement and when it is not a PDF", async () => {
  for (const status of ["draft", "cancelled", "superseded"]) {
    const s = fakeDb(ag(status));
    await assert.rejects(() => recordSignedReturn(s.db, "u1", "a1", pdf), /generated, sent or returned/);
    assert.equal(s.t.agreement_documents.length, 0);
  }
  const s = fakeDb(ag("sent"));
  await assert.rejects(() => recordSignedReturn(s.db, "u1", "a1", Buffer.from("<html>")), /Only PDF/);
  await assert.rejects(() => recordSignedReturn(s.db, "u1", "a1", Buffer.alloc(0)), /Choose a signed PDF/);
});

test("a signed upload is evidence only: it marks the agreement returned, never verified, and never touches the project stage", async () => {
  const s = fakeDb({ ...ag("sent"), agreement_documents: [] });
  await recordSignedReturn(s.db, "u1", "a1", pdf);
  assert.equal(s.t.agreements[0].status, "returned");
  assert.equal(s.t.agreement_documents[0].verified_at, undefined);
  assert.equal(s.t.projects[0].stage, "agreement_sent");
});

test("DEFECT: a signed-copy upload whose database insert fails leaves the file behind, so every retry fails", { todo: "recordSignedReturn uploads with upsert:false before recording the document" }, async () => {
  const s = fakeDb({ ...ag("sent"), agreement_documents: [] });
  s.failInsert.add("agreement_documents");
  await assert.rejects(() => recordSignedReturn(s.db, "u1", "a1", pdf));
  s.failInsert.clear();
  await recordSignedReturn(s.db, "u1", "a1", pdf); // desired: the retry succeeds
  assert.equal(s.t.agreements[0].status, "returned");
});

// ---- Email accepted by the provider, then a later step fails ----

const row = (over: Partial<EstimateRow> = {}): EstimateRow => ({
  id: "e1", project_id: "p1", revision_number: 1, status: "approved", price_min: 1000, price_max: 2000, pricing_version: "v1",
  pricing_snapshot: { is_placeholder: false, status: "approved" }, input_snapshot: {}, approved_at: "2026-10-01T00:00:00Z", sent_at: null, ...over,
});

test("estimate: a provider failure or skip leaves the estimate approved and unsent", async () => {
  for (const status of ["failed", "skipped"] as const) {
    const e = row();
    const store: EstimateStore = { load: async () => e, latestRevision: async () => 1, transition: async () => { e.status = "sent"; return true; } };
    const r = await sendApprovedEstimate(store, { estimateId: "e1", projectId: "p1", emailEnabled: true, deliver: async () => (status === "failed" ? { status, code: "http_500" } : { status, reason: "demo" }) });
    assert.equal(r.ok, false);
    assert.equal(e.status, "approved");
  }
});

test("DEFECT: estimate emailed, then the database update to 'sent' fails: the estimate stays 'approved' and the call throws instead of reporting the send", { todo: "sendApprovedEstimate lets the transition error escape after delivery" }, async () => {
  const e = row();
  let delivered = 0;
  const store: EstimateStore = { load: async () => e, latestRevision: async () => 1, transition: async () => { throw new Error("db down"); } };
  const r = await sendApprovedEstimate(store, { estimateId: "e1", projectId: "p1", emailEnabled: true, deliver: async () => (delivered++, { status: "sent", providerId: "p", messageId: "m" }) });
  assert.equal(delivered, 1);
  assert.equal(r.ok, true, "the customer has the email, so the result must say so");
});

const draftSeed = () => ({
  settings: [{ key: "demo_mode", value: { enabled: false, recipient_allowlist: [] } }],
  inbox_emails: [{ id: "e1", from_address: "ann@example.com", from_name: "Ann", provider_message_id: "gm1", provider_thread_id: "thr-0", contact_id: "c1", project_id: null, status: "open" }],
  email_drafts: [{ id: "d1", status: "approved", subject: "Re: Hi", body_text: "Thanks", email_id: "e1" }],
});

test("Gmail reply: not configured, or the sender refusing, never marks the draft sent", async () => {
  delete process.env.GMAIL_SEND_WEBHOOK_URL;
  const a = fakeDb(draftSeed());
  assert.equal((await sendApprovedDraft(a.db, "d1", "u1", "Paul")).ok, false);
  assert.equal(a.t.email_drafts[0].status, "approved");
  assert.equal(calls.length, 0);

  process.env.GMAIL_SEND_WEBHOOK_URL = "https://gmail-sender.example.test/send";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })) as unknown as typeof fetch;
  const b = fakeDb(draftSeed());
  const r = await sendApprovedDraft(b.db, "d1", "u1", "Paul");
  assert.equal(r.ok, false);
  assert.equal(b.t.email_drafts[0].status, "failed");
  assert.equal(b.t.inbox_emails.length, 1, "no 'sent' copy is stored");
});

test("Gmail reply: success marks the draft sent, stores our reply once and closes the original", async () => {
  const s = fakeDb(draftSeed());
  assert.equal((await sendApprovedDraft(s.db, "d1", "u1", "Paul")).ok, true);
  assert.equal(s.t.email_drafts[0].status, "sent");
  assert.equal(s.t.inbox_emails.filter((e) => e.direction === "outbound").length, 1);
  assert.equal(s.t.inbox_emails[0].status, "handled");
  assert.equal(s.t.inbox_emails.find((e) => e.direction === "outbound")!.project_id, null);
  // Approving again does nothing: a sent draft is not sent twice.
  assert.equal((await sendApprovedDraft(s.db, "d1", "u1", "Paul")).ok, false);
  assert.equal(calls.length, 1);
});

test("DEFECT: Gmail reply sent, then the draft update fails silently: the call reports success while the draft is still 'approved' and can be sent again", { todo: "sendApprovedDraft ignores the error of its post-send updates" }, async () => {
  const s = fakeDb(draftSeed());
  s.failUpdate.add("email_drafts");
  const r = await sendApprovedDraft(s.db, "d1", "u1", "Paul");
  assert.equal(calls.length, 1);
  assert.ok(!r.ok || s.t.email_drafts[0].status === "sent", "either report the problem or leave the draft sent");
});

test("DEFECT: customer email accepted by the provider but the delivery record update fails: the record still says 'queued' with no provider id", { todo: "sendRecordedEmail does not check the error of its post-send updates" }, async () => {
  const s = fakeDb({ settings: [{ key: "demo_mode", value: { enabled: false, recipient_allowlist: [] } }] });
  s.failUpdate.add("message_deliveries");
  const r = await sendRecordedEmail({ db: s.db, contactId: "c1", projectId: "p1", to: "ann@example.com", mail: { subject: "S", html: "x", text: "x" }, idempotencyKey: "k1" });
  assert.equal(r.status, "sent");
  assert.equal(s.t.message_deliveries[0].status, "submitted");
});

// ---- Intake after the lead is saved ----

test("DEFECT: intake ignores the 'not fully processed' result, so a lead whose follow-up steps failed is not flagged for staff", { todo: "route.ts discards fully_processed; project-column and lead-assessment failures only log" }, () => {
  const route = readFileSync(new URL("../app/api/intake/route.ts", import.meta.url), "utf8");
  assert.match(route, /fully_processed/);
});

test("duplicate website submissions return success without processing again (and never email twice)", () => {
  const p = readFileSync(new URL("./leads/process.ts", import.meta.url), "utf8");
  assert.match(p, /outcome === "duplicate"\)\s*\n?\s*return/);
  const send = readFileSync(new URL("./leads/estimate-send.ts", import.meta.url), "utf8");
  assert.match(send, /estimate-email:\$\{e\.id\}:1/);
  assert.match(send, /inquiry-ack:\$\{projectId\}/);
});
