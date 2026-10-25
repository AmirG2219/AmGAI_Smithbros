import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDrafts, findOrCreateCustomer, createManualProject, recordAcceptedQuote, UserError } from "./build";
import { loadSendAttempts, sendAgreementsEmail, summarizeSends } from "./send";
import { sentEmailStatus } from "../email/status";
import { verifySigned } from "./review";
import { advanceStage } from "./project-stage";
import { parseQuoteEntry } from "./vars";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

// In-memory stand-in for Supabase: only the calls these modules make, plus the database rules that matter here
// (a work contract needs an accepted quote of its project; "sent" needs an attached email; "won" needs a verified contract).
// `failUpdate` makes updates of one table fail, to test failure handling. Nothing touches a real database or network.
let clock = 0;
function fakeDb(seed: Tables, files: Record<string, Buffer> = {}) {
  const t: Tables = { projects: [], events: [], agreements: [], agreement_documents: [], final_quotes: [], contacts: [], agreement_template_versions: [], message_attachments: [], settings: [], conversations: [], messages: [], message_deliveries: [], ...seed };
  const failUpdate = new Set<string>();
  const from = (table: string) => {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let ins: Row[] = [];
    const filters: ((r: Row) => boolean)[] = [];
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (k.includes(".") || filters.push((r) => (k.includes("->>") ? r[k.split("->>")[0]]?.[k.split("->>")[1]] === v : r[k] === v)), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      ilike: (k: string, v: string) => (filters.push((r) => String(r[k] ?? "").includes(v.replaceAll("%", ""))), b),
      not: (k: string, _o: string, v: string) => (filters.push((r) => !v.replace(/[()]/g, "").split(",").includes(r[k])), b),
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
        if (table === "agreements")
          for (const r of ins) {
            const q = t.final_quotes.find((x) => x.id === r.final_quote_id && x.project_id === r.project_id);
            if (r.document_type === "work_contract" && q?.status !== "accepted") return { error: { message: "agreements: a work contract requires an accepted final quote of the same project" } };
          }
        if (table === "message_deliveries" && ins.some((r) => t.message_deliveries.some((x) => x.idempotency_key === r.idempotency_key)))
          return { error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        const made = ins.map((r) => ({ id: `${table}-${t[table].length + 1}`, created_at: new Date(Date.UTC(2026, 9, 1) + (clock += 1000)).toISOString(), ...r }));
        t[table].push(...made);
        return { data: made };
      }
      let hit = t[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        if (failUpdate.has(table)) return { error: { message: `${table}: update failed` } };
        for (const r of hit) {
          const next = { ...r, ...patch };
          if (table === "projects" && patch.stage === "won" && !t.agreements.some((a) => a.project_id === r.id && a.document_type === "work_contract" && a.status === "verified"))
            return { error: { message: "projects: stage won requires a verified signed work contract" } };
          if (table === "agreements" && patch.status === "sent") {
            const docIds = t.agreement_documents.filter((d) => d.agreement_id === r.id && d.document_kind === "generated").map((d) => d.id);
            if (!t.message_attachments.some((m) => docIds.includes(m.agreement_document_id))) return { error: { message: "agreements: cannot mark sent without an email attachment" } };
          }
          if (table === "agreements" && patch.status === "verified" && !t.agreement_documents.some((d) => d.agreement_id === r.id && d.verified_at)) return { error: { message: "agreements: cannot mark verified" } };
          Object.assign(r, next);
        }
        return { data: hit };
      }
      if (table === "agreements")
        hit = hit.map((a) => {
          const v = t.agreement_template_versions.find((x) => x.id === a.template_version_id);
          return { ...a, agreement_documents: t.agreement_documents.filter((d) => d.agreement_id === a.id), agreement_template_versions: v ? { agreement_templates: v.agreement_templates } : null };
        });
      if (table === "message_attachments") hit = hit.map((r) => ({ ...r, messages: { message_deliveries: t.message_deliveries.filter((d) => d.message_id === r.message_id) } }));
      if (table === "projects") hit = hit.map((p) => ({ ...p, contacts: t.contacts.find((c) => c.id === p.contact_id) ?? null }));
      return { data: hit };
    }
    return b;
  };
  const storage = { from: () => ({ download: async (p: string) => (files[p] ? { data: { arrayBuffer: async () => files[p] }, error: null } : { data: null, error: new Error("missing") }) }) };
  return { db: { from, storage } as unknown as SupabaseClient, t, failUpdate };
}

const tplText = Buffer.from("# Agreement\n\nFor {{client_name}}");
const tplVersion = (id: string, type: string, name = "Approved agreement") => ({
  id, document_type: type, status: "approved", template_storage_path: `tpl/${id}`, template_sha256: createHash("sha256").update(tplText).digest("hex"), agreement_templates: { name, is_active: true },
});
const files = { "tpl/v-wc": tplText, "tpl/v-pl": tplText, "gen/wc": Buffer.from("%PDF-wc"), "gen/pl": Buffer.from("%PDF-pl") };
const base = (stage = "estimate_sent", quotes: Row[] = []): Tables => ({
  projects: [{ id: "p1", contact_id: "c1", stage, project_type: "new_installation" }],
  contacts: [{ id: "c1", first_name: "Ann", last_name: "Lee", email: "ann@example.com", email_normalized: "ann@example.com", phone: "403 555 0100" }],
  agreement_template_versions: [tplVersion("v-wc", "work_contract"), tplVersion("v-pl", "policy_liability")],
  final_quotes: quotes,
  settings: [{ key: "demo_mode", value: { enabled: false, recipient_allowlist: [] } }],
});
const accepted = { id: "q1", project_id: "p1", status: "accepted", scope_of_work: "Install floor", exclusions: null, subtotal_amount: 1000, tax_amount: 50 };
const inputs = { site_address: "1 Main", client_email: "", client_phone: "", deposit_percent: "40", start_date: "2026-11-01", completion_estimate: "2 weeks", payment_terms: "" } as never;
const stageEvents = (t: Tables) => t.events.filter((e) => e.event_type === "project.stage_changed");
const stage = (t: Tables) => t.projects.find((p) => p.id === "p1")!.stage;

// Email delivery is a stubbed fetch: nothing leaves the machine.
const realFetch = globalThis.fetch;
const saved = { ...process.env };
let fetchCalls = 0;
let provider: "ok" | "reject" | "error500" | "network" = "ok";
beforeEach(() => {
  fetchCalls = 0;
  provider = "ok";
  Object.assign(process.env, { EMAIL_SENDING_ENABLED: "true", INBOX_ADDRESS: "shared@example.test", RESEND_API_KEY: "test-key", EMAIL_FROM: "Smith Bros <noreply@example.test>" });
  globalThis.fetch = (async () => {
    fetchCalls++;
    if (provider === "network") throw new Error("socket hang up");
    if (provider === "ok") return new Response(JSON.stringify({ id: "prov-1" }), { status: 200 });
    return new Response(JSON.stringify({ message: "nope" }), { status: provider === "reject" ? 422 : 500 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
});

const generated = (type: string, id: string, extra: Row = {}) => ({
  agreements: [{ id, project_id: "p1", document_type: type, status: "generated", template_version_id: type === "work_contract" ? "v-wc" : "v-pl", ...extra }],
  agreement_documents: [{ id: `d-${id}`, agreement_id: id, document_kind: "generated", revision_number: 1, storage_path: type === "work_contract" ? "gen/wc" : "gen/pl" }],
});
const mail = { to: "ann@example.com", subject: "Your agreement", body: "Hello" };

// ---- createDrafts ----

test("website lead with an accepted quote: drafting the contract moves the project to customer accepted once", async () => {
  const { db, t } = fakeDb(base("estimate_sent", [accepted]), files);
  const [id] = await createDrafts(db, "u1", "p1", ["work_contract"], inputs);
  assert.ok(id);
  assert.equal(stage(t), "customer_accepted");
  assert.equal(stageEvents(t).length, 1);
  assert.equal(t.final_quotes.length, 1, "the existing quote is reused, not duplicated");
  // A repeat is refused (a current contract exists) and records nothing more.
  await assert.rejects(() => createDrafts(db, "u1", "p1", ["work_contract"], inputs), UserError);
  assert.equal(stageEvents(t).length, 1);
});

test("customer created directly in Agreements, price typed by staff: accepted when recorded, with a staff-recorded history", async () => {
  const seed = fakeDb(base(), files);
  const { db, t } = seed;
  t.contacts.length = 0;
  t.projects.length = 0;
  const c = await findOrCreateCustomer(db, { first_name: "Bo", last_name: "Ng", email: "bo@example.com" });
  assert.equal(c.kind, "created");
  const projectId = await createManualProject(db, (c as { id: string }).id, { project_type: "new_installation", site_address_line1: "2 Elm" });
  t.projects.find((p) => p.id === projectId)!.stage = "new"; // the real column default
  t.final_quotes.length = 0;
  const q = parseQuoteEntry({ scope: "Install", subtotal: "2000", taxRate: "5", confirmed: true });
  assert.ok(q.ok);
  const [id] = await createDrafts(db, "u1", projectId, ["work_contract"], inputs, undefined, q.ok ? q.value : undefined);
  assert.ok(id);
  const p = t.projects.find((x) => x.id === projectId)!;
  assert.equal(p.stage, "customer_accepted");
  assert.deepEqual(
    t.events.filter((e) => e.project_id === projectId).map((e) => e.event_type),
    ["final_quote.prepared", "final_quote.accepted", "project.stage_changed", "agreement.draft_created"],
  );
  const ev = t.events.find((e) => e.event_type === "project.stage_changed")!;
  assert.equal(ev.details.basis, "staff_recorded");
  assert.match(t.final_quotes[0].acceptance_note, /confirmed by staff/);
});

test("an existing customer is reused by email, not duplicated", async () => {
  const { db, t } = fakeDb(base(), files);
  const r = await findOrCreateCustomer(db, { first_name: "Ann", email: "ann@example.com" });
  assert.deepEqual(r, { kind: "existing", id: "c1" });
  assert.equal(t.contacts.length, 1);
});

test("accepting a quote on record moves the project when recorded, before any contract draft exists", async () => {
  const { db, t } = fakeDb(base("new"), files);
  await recordAcceptedQuote(db, "u1", { projectId: "p1", contactId: "c1" }, { scope: "Install", exclusions: null, subtotal: 100, tax: 5 });
  assert.equal(stage(t), "customer_accepted");
  assert.equal(t.agreements.length, 0);
});

test("no accepted quote, or only a draft/approved one: a contract cannot be drafted and the stage does not move", async () => {
  for (const quotes of [[], [{ ...accepted, status: "draft" }], [{ ...accepted, status: "approved" }]]) {
    const { db, t } = fakeDb(base("estimate_sent", quotes), files);
    await assert.rejects(() => createDrafts(db, "u1", "p1", ["work_contract"], inputs), UserError);
    assert.equal(stage(t), "estimate_sent");
    assert.equal(t.agreements.length, 0);
    assert.equal(stageEvents(t).length, 0);
  }
});

test("a policy-only draft never moves the stage", async () => {
  const { db, t } = fakeDb(base("estimate_sent"), files);
  const [id] = await createDrafts(db, "u1", "p1", ["policy_liability"], inputs);
  assert.ok(id);
  assert.equal(stage(t), "estimate_sent");
  assert.equal(stageEvents(t).length, 0);
});

test("a failure while recording the price does not report the project as accepted", async () => {
  const { db, t, failUpdate } = fakeDb(base("new"), files);
  failUpdate.add("final_quotes");
  await assert.rejects(() => recordAcceptedQuote(db, "u1", { projectId: "p1", contactId: "c1" }, { scope: "Install", exclusions: null, subtotal: 100, tax: 5 }));
  assert.equal(stage(t), "new");
  assert.equal(stageEvents(t).length, 0);
  assert.ok(!t.events.some((e) => e.event_type === "final_quote.accepted"));
});

test("a failed stage update throws and writes no history entry", async () => {
  const { db, t, failUpdate } = fakeDb(base("estimate_sent"), files);
  failUpdate.add("projects");
  await assert.rejects(() => advanceStage(db, { projectId: "p1", contactId: "c1" }, "u1", "customer_accepted", "x"));
  assert.equal(stage(t), "estimate_sent");
  assert.equal(stageEvents(t).length, 0);
});

// ---- sendAgreementsEmail ----

test("sending the work contract moves the project to agreement sent; a reminder or second send adds nothing", async () => {
  const { db, t } = fakeDb({ ...base("customer_accepted", [accepted]), ...generated("work_contract", "a1") }, files);
  assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], mail)).outcome, "sent");
  assert.equal(fetchCalls, 1, "one stubbed provider call, no real network");
  assert.equal(t.agreements[0].status, "sent");
  assert.equal(stage(t), "agreement_sent");
  assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], mail, true)).outcome, "sent");
  assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], mail)).outcome, "sent");
  assert.equal(stageEvents(t).length, 1);
  assert.equal(t.events.filter((e) => e.event_type === "agreement.sent").length, 2);
});

test("a policy sent alone does not move the project", async () => {
  const { db, t } = fakeDb({ ...base("customer_accepted", [accepted]), ...generated("policy_liability", "a1") }, files);
  assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], mail)).outcome, "sent");
  assert.equal(t.agreements[0].status, "sent");
  assert.equal(stage(t), "customer_accepted");
  assert.equal(stageEvents(t).length, 0);
});

test("provider failure, demo-mode skip, blocked template and invalid input leave the agreement generated and the stage untouched", async () => {
  const cases: [string, (tb: Tables) => void, "failed" | "skipped" | "blocked" | "invalid" | "uncertain", string?][] = [
    ["provider refuses it", () => (provider = "reject"), "failed"],
    ["provider gives no definite answer", () => (provider = "error500"), "uncertain"],
    ["demo mode skips", (tb) => (tb.settings[0].value = { enabled: true, recipient_allowlist: [] }), "skipped"],
    ["placeholder template", (tb) => (tb.agreement_template_versions[0].agreement_templates.name = "Placeholder contract"), "blocked"],
    ["bad recipient", () => {}, "invalid", "not-an-email"],
    ["INBOX_ADDRESS missing", () => delete process.env.INBOX_ADDRESS, "blocked"],
    ["INBOX_ADDRESS invalid", () => (process.env.INBOX_ADDRESS = "nope"), "blocked"],
  ];
  for (const [name, setup, outcome, to] of cases) {
    const { db, t } = fakeDb({ ...base("customer_accepted", [accepted]), ...generated("work_contract", "a1") }, files);
    setup(t);
    assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], { ...mail, to: to ?? mail.to })).outcome, outcome, name);
    assert.equal(t.agreements[0].status, "generated", name);
    assert.equal(stage(t), "customer_accepted", name);
    assert.equal(stageEvents(t).length, 0, name);
    assert.ok(!t.events.some((e) => e.event_type === "agreement.sent"), name);
  }
});

test("if only the stage update fails after a delivered send, the send is still reported as sent and no stage change is claimed", async () => {
  const { db, t, failUpdate } = fakeDb({ ...base("customer_accepted", [accepted]), ...generated("work_contract", "a1") }, files);
  failUpdate.add("projects");
  const errors = console.error;
  console.error = () => {};
  try {
    assert.equal((await sendAgreementsEmail(db, "u1", ["a1"], mail)).outcome, "sent");
  } finally {
    console.error = errors;
  }
  assert.equal(t.agreements[0].status, "sent");
  assert.equal(stage(t), "customer_accepted");
  assert.equal(stageEvents(t).length, 0);
  // A reminder repairs it.
  failUpdate.clear();
  await sendAgreementsEmail(db, "u1", ["a1"], mail, true);
  assert.equal(stage(t), "agreement_sent");
  assert.equal(stageEvents(t).length, 1);
});

// ---- Policy alone, and the full path ----

test("a signed, verified policy alone cannot make the project won, even after the contract was sent", async () => {
  const { db, t } = fakeDb({
    ...base("agreement_sent", [accepted]),
    agreements: [
      { id: "a1", project_id: "p1", document_type: "work_contract", status: "sent" },
      { id: "a2", project_id: "p1", document_type: "policy_liability", status: "returned" },
    ],
    agreement_documents: [{ id: "d2", agreement_id: "a2", document_kind: "signed_return", revision_number: 1, verified_at: null }],
  }, files);
  await verifySigned(db, "u1", "a2", "checked");
  await verifySigned(db, "u1", "a2", "again");
  assert.equal(t.agreements.find((a) => a.id === "a2")!.status, "verified");
  assert.equal(stage(t), "agreement_sent");
  assert.equal(stageEvents(t).length, 0);
});

test("full path from a website lead: one stage entry per step, Won only after the work contract is verified", async () => {
  const { db, t } = fakeDb(base("estimate_sent", [accepted]), files);
  const [id] = await createDrafts(db, "u1", "p1", ["work_contract"], inputs);
  assert.equal(stage(t), "customer_accepted");
  Object.assign(t.agreements.find((a) => a.id === id)!, { status: "generated" });
  t.agreement_documents.push({ id: "dg", agreement_id: id, document_kind: "generated", revision_number: 1, storage_path: "gen/wc" });
  await sendAgreementsEmail(db, "u1", [id], mail);
  assert.equal(stage(t), "agreement_sent");
  Object.assign(t.agreements.find((a) => a.id === id)!, { status: "returned" });
  t.agreement_documents.push({ id: "ds", agreement_id: id, document_kind: "signed_return", revision_number: 1, verified_at: null });
  assert.notEqual(stage(t), "won", "an uploaded, unverified signed copy is not Won");
  await verifySigned(db, "u1", id, "checked");
  await verifySigned(db, "u1", id, "checked");
  assert.equal(stage(t), "won");
  assert.deepEqual(stageEvents(t).map((e) => e.details.to), ["customer_accepted", "agreement_sent", "won"]);
});

// ---- Send outcomes: what staff are told, what is recorded, and what survives a refresh ----

const sendFixture = (type = "work_contract") => fakeDb({ ...base("customer_accepted", [accepted]), ...generated(type, "a1") }, files);
const state = async (f: ReturnType<typeof sendFixture>) => summarizeSends(await loadSendAttempts(f.db, ["d-a1"]), f.t.agreements[0].status);
const quiet = async <T,>(fn: () => Promise<T>) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

test("accepted by the provider: sent, delivery recorded as submitted (never 'delivered'), and the status survives a refresh", async () => {
  const f = sendFixture();
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "sent");
  assert.equal(f.t.message_deliveries[0].status, "submitted");
  assert.ok(f.t.message_deliveries[0].accepted_at && f.t.message_deliveries[0].provider_message_id);
  assert.equal(f.t.agreements[0].status, "sent");
  assert.equal(stage(f.t), "agreement_sent");
  assert.match(f.t.events.find((e) => e.event_type === "agreement.sent")!.summary, /accepted by the email provider; delivery is not confirmed/);
  const s = await state(f); // a fresh read of the records, as the page does after a refresh
  assert.deepEqual(s, { kind: "accepted", at: f.t.message_deliveries[0].accepted_at, delivered: false });
});

test("only a delivery record that says delivered is shown as delivered", async () => {
  const f = sendFixture();
  await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" });
  f.t.message_deliveries[0].status = "delivered";
  assert.equal((await state(f) as { delivered: boolean }).delivered, true);
});

test("provider refusal: reported as failed, nothing marked sent, refusal recorded, and a retry is allowed and works", async () => {
  const f = sendFixture();
  provider = "reject";
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "failed");
  assert.equal(f.t.agreements[0].status, "generated");
  assert.equal(f.t.message_deliveries[0].status, "failed");
  assert.equal(stage(f.t), "customer_accepted");
  assert.ok(f.t.events.some((e) => e.event_type === "agreement.send_failed"));
  assert.equal((await state(f)).kind, "rejected");
  provider = "ok";
  // The same form retried after a refusal is the next attempt of that request, not a duplicate.
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "sent");
  assert.equal(fetchCalls, 2);
  assert.deepEqual(f.t.message_deliveries.map((d) => d.idempotency_key.split(":").pop()), ["1", "2"]);
});

test("accepted but the agreement status cannot be saved: reported as unrecorded (not failed), shown after refresh, and Send then only records it", async () => {
  const f = sendFixture();
  f.failUpdate.add("agreements");
  const r = await quiet(() => sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }));
  assert.equal(r.outcome, "unrecorded");
  assert.equal(fetchCalls, 1);
  assert.equal(f.t.agreements[0].status, "generated");
  assert.ok(f.t.events.some((e) => e.event_type === "agreement.send_unrecorded"));
  assert.equal((await state(f)).kind, "unrecorded");

  // The database recovers. Staff click Send again (a new opening of the form): the contract is NOT emailed again.
  f.failUpdate.clear();
  const again = await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k2" });
  assert.equal(again.outcome, "recovered");
  assert.equal(fetchCalls, 1, "no second email");
  assert.equal(f.t.agreements[0].status, "sent");
  assert.equal(stage(f.t), "agreement_sent");
  assert.equal(f.t.events.filter((e) => e.event_type === "agreement.send_recovered").length, 1);
  assert.equal((await state(f)).kind, "accepted");
  // And once recorded, repeating that request is a duplicate.
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k2" })).outcome, "duplicate");
  assert.equal(fetchCalls, 1);
});

test("accepted but the delivery record cannot be updated: reported as unrecorded and further sending is paused for staff", async () => {
  const f = sendFixture();
  f.failUpdate.add("message_deliveries");
  assert.equal((await quiet(() => sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }))).outcome, "unrecorded");
  assert.equal(fetchCalls, 1);
  assert.equal(f.t.agreements[0].status, "sent", "what could be saved was saved");
  f.failUpdate.clear();
  assert.equal((await state(f)).kind, "uncertain");
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, true, { attemptKey: "k2" })).outcome, "uncertain");
  assert.equal(fetchCalls, 1, "no blind resend");
});

test("no definite answer from the provider (5xx or network error): uncertain, recorded as such, and resending is blocked until staff confirm", async () => {
  for (const mode of ["error500", "network"] as const) {
    fetchCalls = 0;
    const f = sendFixture();
    provider = mode;
    assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "uncertain", mode);
    assert.equal(f.t.agreements[0].status, "generated");
    assert.equal(f.t.message_deliveries[0].status, "queued", "never recorded as failed or delivered");
    assert.ok(f.t.events.some((e) => e.event_type === "agreement.send_uncertain"));
    assert.equal(stage(f.t), "customer_accepted");
    assert.equal((await state(f)).kind, "uncertain");

    provider = "ok";
    assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k2" })).outcome, "uncertain", "blind retry refused");
    assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "uncertain", "even the same request");
    assert.equal(fetchCalls, 1);

    // Staff checked and confirmed it was not sent: the earlier attempt is closed as failed by staff decision, and a new one goes out.
    assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k3", confirmedNotSent: true })).outcome, "sent", mode);
    assert.equal(fetchCalls, 2);
    assert.equal(f.t.message_deliveries[0].status, "failed");
    assert.equal(f.t.message_deliveries[0].error_code, "staff_confirmed_not_sent");
    assert.ok(f.t.events.some((e) => e.event_type === "agreement.send_override"));
    assert.equal(f.t.agreements[0].status, "sent");
  }
});

test("a repeated request or double click is one attempt: the second is a duplicate and nothing more is sent", async () => {
  const f = sendFixture();
  const first = await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" });
  const second = await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" });
  assert.deepEqual([first.outcome, second.outcome], ["sent", "duplicate"]);
  assert.equal(fetchCalls, 1);
  assert.equal(f.t.events.filter((e) => e.event_type === "agreement.sent").length, 1);
  assert.equal(stageEvents(f.t).length, 1);
});

test("two simultaneous requests with the same key send once", async () => {
  const f = sendFixture();
  const [a, b] = await Promise.all([
    sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }),
    sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }),
  ]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ["duplicate", "sent"]);
  assert.equal(fetchCalls, 1);
});

test("a reminder is a deliberate new send, but the same reminder request is not repeated", async () => {
  const f = sendFixture();
  await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" });
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, true, { attemptKey: "r1" })).outcome, "sent");
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, true, { attemptKey: "r1" })).outcome, "duplicate");
  assert.equal(fetchCalls, 2);
  assert.match(f.t.events.find((e) => e.event_type === "agreement.reminder_sent")!.summary, /delivery is not confirmed/);
});

test("failures before the provider is reached report failed, send nothing, and leave no 'sent' record", async () => {
  const a = sendFixture();
  const downloadFails = { ...a.db, storage: { from: () => ({ download: async () => ({ data: null, error: new Error("missing") }) }) } } as unknown as SupabaseClient;
  assert.equal((await sendAgreementsEmail(downloadFails, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "failed");
  assert.equal(fetchCalls, 0);
  assert.equal(a.t.agreements[0].status, "generated");

  const b = sendFixture();
  const brokenInsert = { ...b.db, from: (table: string) => (table === "messages" ? { insert: () => ({ select: () => ({ single: async () => ({ error: { message: "db down" } }) }) }) } : (b.db as any).from(table)) } as unknown as SupabaseClient;
  assert.equal((await quiet(() => sendAgreementsEmail(brokenInsert, "u1", ["a1"], mail, false, { attemptKey: "k1" }))).outcome, "failed");
  assert.equal(fetchCalls, 0);
  assert.equal(b.t.agreements[0].status, "generated");
  assert.equal(b.t.message_deliveries.length, 0);
});

test("demo mode and missing Reply-To still stop the send before anything is recorded", async () => {
  const f = sendFixture();
  f.t.settings[0].value = { enabled: true, recipient_allowlist: [] };
  assert.equal((await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" })).outcome, "skipped");
  assert.equal(f.t.message_deliveries.length, 0);
  assert.equal(fetchCalls, 0);
});

test("the send action passes the form's attempt key and confirmation, requires an admin, and the page shows the recorded state", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const actions = read("app/(app)/agreements/actions.ts");
  assert.match(actions, /export async function sendAction[\s\S]*await requireAdmin\(\)/);
  assert.match(actions, /attemptKey: str\(formData, "send_key"\)/);
  assert.match(actions, /confirmedNotSent: formData\.get\("confirm_resend"\) === "on"/);
  const page = read("app/(app)/agreements/[id]/page.tsx");
  assert.match(page, /summarizeSends/);
  assert.match(page, /Staff attention required/);
  assert.match(page, /delivery not confirmed/);
});

// ---- A message record is not proof of sending ----

test("email status comes only from recorded provider outcomes: a message with no delivery attempt is never shown as Sent", () => {
  assert.equal(sentEmailStatus([]), "Not sent");
  assert.equal(sentEmailStatus(null), "Not sent");
  assert.equal(sentEmailStatus([{ status: "queued", accepted_at: null }]), "Outcome unknown");
  assert.equal(sentEmailStatus([{ status: "failed", accepted_at: null }]), "Not sent");
  assert.equal(sentEmailStatus([{ status: "submitted", accepted_at: "2026-10-01T00:00:00Z" }]), "Sent");
  assert.equal(sentEmailStatus([{ status: "delivered", accepted_at: "2026-10-01T00:00:00Z" }]), "Delivered");
  assert.equal(sentEmailStatus([{ status: "bounced", accepted_at: "2026-10-01T00:00:00Z" }]), "Bounced");
  assert.equal(sentEmailStatus([{ status: "failed", accepted_at: null }, { status: "submitted", accepted_at: "2026-10-01T00:00:00Z" }]), "Sent");
});

test("after simultaneous duplicate requests, every message the Contact page lists is shown from its own delivery outcome", async () => {
  const f = sendFixture();
  await Promise.all([
    sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }),
    sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" }),
  ]);
  assert.equal(fetchCalls, 1);
  const shown = f.t.messages.map((m) => sentEmailStatus(f.t.message_deliveries.filter((d) => d.message_id === m.id) as never));
  assert.equal(shown.filter((x) => x === "Sent").length, 1, "exactly the one email that went out is Sent");
  assert.ok(shown.every((x) => x === "Sent" || x === "Not sent"), "a leftover message with no delivery attempt is Not sent");
});

test("the Contact page derives each email's status from its delivery attempts, not from the message record", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../../app/(app)/contacts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /message_deliveries\(status, accepted_at\)/);
  assert.match(page, /sentEmailStatus\(m\.message_deliveries\)/);
  assert.doesNotMatch(page, /"outbound" \? "Sent"/);
});

test("the uncertain-send confirmation tells staff to check the provider's records and calls itself a staff statement", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../../app/(app)/agreements/client.tsx", import.meta.url), "utf8");
  assert.match(ui, /check the email provider&apos;s own records/);
  assert.match(ui, /my statement, not as confirmation from the provider/);
  const f = sendFixture();
  provider = "error500";
  await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k1" });
  provider = "ok";
  await sendAgreementsEmail(f.db, "u1", ["a1"], mail, false, { attemptKey: "k2", confirmedNotSent: true });
  assert.match(f.t.message_deliveries[0].error_summary, /staff statement, not evidence from the provider/);
  assert.match(f.t.events.find((e) => e.event_type === "agreement.send_override")!.summary, /not confirmation from the provider/);
});
