import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoApproveEstimate, sendApprovedEstimate, type EstimateRow, type EstimateStore } from "./estimate-approval";
import { priceEstimate, type PricingDefinition } from "./estimate";
import type { Inquiry } from "./inquiry";
import { acknowledgmentEmail, customerEstimateEmail } from "@/lib/email/templates";

const P = "project-1";
const REAL = { is_placeholder: false, status: "approved" };
const row = (o: Partial<EstimateRow> = {}): EstimateRow => ({
  id: "e1",
  project_id: P,
  revision_number: 1,
  status: "draft",
  price_min: 4000,
  price_max: 6000,
  pricing_version: "v1",
  pricing_snapshot: REAL,
  input_snapshot: { project_type: "new_installation", material: "hardwood", square_footage: 500 },
  approved_at: null,
  sent_at: null,
  ...o,
});

// In-memory stand-in for the database: same conditional-update behaviour, no network, no real records.
function memStore(rows: EstimateRow[]): EstimateStore & { rows: EstimateRow[] } {
  return {
    rows,
    async load(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async latestRevision(pid) {
      return Math.max(0, ...rows.filter((r) => r.project_id === pid).map((r) => r.revision_number));
    },
    async transition(id, from, patch) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== from) return false;
      Object.assign(r, patch);
      return true;
    },
  };
}

const sentOk = async () => ({ status: "sent" as const, providerId: "p", messageId: "m" });
const approvedRow = (o: Partial<EstimateRow> = {}) => row({ status: "approved", approved_at: "2026-10-25T10:00:00Z", ...o });
const send = (store: EstimateStore, o: Partial<Parameters<typeof sendApprovedEstimate>[1]> = {}) =>
  sendApprovedEstimate(store, { estimateId: "e1", projectId: P, emailEnabled: true, deliver: sentOk, ...o });
const auto = (store: EstimateStore) => autoApproveEstimate(store, { estimateId: "e1", projectId: P });

// ---- Automatic approval: only a real, current, priced estimate ----

test("a priced draft from an approved non-placeholder rule is approved by rule, and approving does NOT mark it sent", async () => {
  const s = memStore([row()]);
  assert.deepEqual(await auto(s), { ok: true });
  assert.equal(s.rows[0].status, "approved");
  assert.ok(s.rows[0].approved_at);
  assert.equal(s.rows[0].sent_at, null);
});

test("placeholder or test pricing is never approved automatically", async () => {
  for (const snap of [{ is_placeholder: true, status: "approved" }, { is_placeholder: false, status: "test" }, { is_placeholder: true, status: "test" }, null]) {
    const s = memStore([row({ pricing_snapshot: snap })]);
    assert.deepEqual(await auto(s), { ok: false, code: "placeholder" });
    assert.equal(s.rows[0].status, "draft");
  }
});

test("an inquiry that could not be priced has nothing to approve", async () => {
  const s = memStore([row({ status: "needs_review", price_min: null, price_max: null, pricing_version: null, pricing_snapshot: null })]);
  assert.deepEqual(await auto(s), { ok: false, code: "not-draft" });
  const d = memStore([row({ price_min: null, price_max: null })]);
  assert.deepEqual(await auto(d), { ok: false, code: "no-price" });
});

test("a replaced revision is not approved, and approving twice approves once", async () => {
  const s = memStore([row(), row({ id: "e2", revision_number: 2 })]);
  assert.deepEqual(await auto(s), { ok: false, code: "stale" });
  const t = memStore([row()]);
  await auto(t);
  assert.deepEqual(await auto(t), { ok: false, code: "not-draft" });
});

// ---- Sending: only the approved revision, with honest outcomes ----

test("a draft cannot be sent; only an approved revision can", async () => {
  const s = memStore([row()]);
  let delivered = 0;
  assert.deepEqual(await send(s, { deliver: async () => (delivered++, sentOk()) }), { ok: false, code: "not-approved" });
  assert.equal(delivered, 0);
});

test("sending uses the approved revision's stored range, then marks it sent exactly once", async () => {
  const s = memStore([approvedRow()]);
  const seen: [number | null, number | null][] = [];
  const r = await send(s, { deliver: async (e) => (seen.push([e.price_min, e.price_max]), sentOk()), now: new Date("2026-10-25T11:00:00Z") });
  assert.deepEqual(r, { ok: true, revision: 1 });
  assert.deepEqual(seen, [[4000, 6000]]);
  assert.equal(s.rows[0].status, "sent");
  assert.equal(s.rows[0].sent_at, "2026-10-25T11:00:00.000Z");
  assert.deepEqual(await send(s), { ok: false, code: "already-sent" });
});

test("an approved estimate with placeholder pricing is never sent", async () => {
  const s = memStore([approvedRow({ pricing_snapshot: { is_placeholder: true, status: "test" } })]);
  let delivered = 0;
  assert.deepEqual(await send(s, { deliver: async () => (delivered++, sentOk()) }), { ok: false, code: "placeholder" });
  assert.equal(delivered, 0);
});

test("a stale approval is retired and never sent when a newer revision exists", async () => {
  const s = memStore([approvedRow(), row({ id: "e2", revision_number: 2, price_min: 9000, price_max: 11000 })]);
  let delivered = 0;
  assert.deepEqual(await send(s, { deliver: async () => (delivered++, sentOk()) }), { ok: false, code: "stale" });
  assert.equal(delivered, 0);
  assert.equal(s.rows[0].status, "superseded");
});

test("email unavailable: nothing is sent and the estimate stays approved, not sent", async () => {
  const s = memStore([approvedRow()]);
  let delivered = 0;
  assert.deepEqual(await send(s, { emailEnabled: false, deliver: async () => (delivered++, sentOk()) }), { ok: false, code: "email-off" });
  assert.equal(delivered, 0);
  assert.equal(s.rows[0].status, "approved");
  assert.equal(s.rows[0].sent_at, null);
});

test("a skipped (demo allowlist) or failed delivery is reported honestly and leaves the estimate unsent", async () => {
  const s = memStore([approvedRow()]);
  const skipped = await send(s, { deliver: async () => ({ status: "skipped", reason: "Recipient is not on the demo-mode allowlist" }) });
  assert.deepEqual(skipped, { ok: false, code: "skipped", reason: "Recipient is not on the demo-mode allowlist" });
  assert.deepEqual(await send(s, { deliver: async () => ({ status: "failed", code: "network" }) }), { ok: false, code: "failed" });
  assert.equal(s.rows[0].status, "approved");
  assert.equal(s.rows[0].sent_at, null);
});

test("an estimate from another project is not found", async () => {
  const s = memStore([approvedRow()]);
  assert.deepEqual(await send(s, { projectId: "other" }), { ok: false, code: "not-found" });
});

// ---- What gets calculated ----

const rule: PricingDefinition = {
  currency: "CAD",
  tax_basis: "excluding_tax",
  per_sqft: { hardwood: { min: 9, max: 15 } },
  project_type_multiplier: { new_installation: 1, commercial: 1.15 },
  minimum_job_charge: 1500,
};
const inquiry = (o: Partial<Inquiry> = {}) => ({ project_type: "new_installation", material: "hardwood", square_footage: 500, ...o }) as Inquiry;

test("an inquiry with enough information gets a calculated range", () => {
  const r = priceEstimate(inquiry(), rule);
  assert.equal(r.priced, true);
  assert.equal(r.priced && r.price_min, 4500);
  assert.equal(r.priced && r.price_max, 7500);
});

test("missing square footage, unknown material or project type are not priced", () => {
  assert.equal(priceEstimate(inquiry({ square_footage: null }), rule).priced, false);
  assert.equal(priceEstimate(inquiry({ material: "tile" }), rule).priced, false);
  assert.equal(priceEstimate(inquiry({ project_type: "restoration" }), rule).priced, false);
});

test("a rule's explicit supported conditions are enforced", () => {
  const limited: PricingDefinition = { ...rule, supported: { project_types: ["new_installation"], max_square_footage: 2000 } };
  assert.equal(priceEstimate(inquiry(), limited).priced, true);
  assert.equal(priceEstimate(inquiry({ project_type: "commercial" }), limited).priced, false);
  assert.equal(priceEstimate(inquiry({ square_footage: 2500 }), limited).priced, false);
});

// ---- Customer wording ----

test("the estimate email labels the range non-binding and subject to inspection", () => {
  const m = customerEstimateEmail({ firstName: "Sam", projectType: "new_installation", material: "hardwood", squareFootage: 500, min: 4500, max: 7500, bookingUrl: null });
  for (const part of [m.text, m.html]) {
    assert.match(part, /non-binding/i);
    assert.match(part, /inspection/i);
  }
  assert.match(m.text, /\$4,500/);
});

test("the acknowledgment email contains no price", () => {
  const m = acknowledgmentEmail({ firstName: "Sam", bookingUrl: null });
  assert.ok(!/\$|\d{3,}/.test(m.text));
  assert.ok(!/\$/.test(m.html));
});

// ---- Wiring (source checks, since the database and email layers are not run in tests) ----

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("intake prices only from an approved, non-placeholder rule and flags unpriced leads for review", () => {
  const p = src("./process.ts");
  assert.match(p, /\.eq\("status", "approved"\)\s*\.eq\("is_placeholder", false\)/);
  assert.ok(!p.includes('"test"'));
  assert.match(p, /unpricedReason: result\.priced \? null : result\.reason/);
});

test("intake sends a priced estimate or a no-price acknowledgment, never a final quote", () => {
  const n = src("./notify.ts");
  assert.match(n, /sendAcknowledgment/);
  assert.match(n, /sendEstimateForProject/);
  const all = n + src("./estimate-send.ts") + src("./estimate-approval.ts") + src("./process.ts");
  assert.ok(!/final_quotes|final_quote/.test(all));
});

test("sending an estimate by hand requires an authorized admin", () => {
  const actions = src("../../app/(app)/leads/[id]/actions.ts");
  const body = actions.slice(actions.indexOf("export async function sendEstimateAction"));
  assert.match(body.slice(0, 200), /await requireAdmin\(\)/);
});
