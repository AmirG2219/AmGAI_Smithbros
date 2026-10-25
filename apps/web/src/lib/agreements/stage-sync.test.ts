import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceStage } from "./project-stage";
import { verifySigned } from "./review";
import { recordAcceptedQuote } from "./build";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// A tiny in-memory stand-in for the Supabase client: only the calls these modules make. It mimics the database's
// "won" guard (a verified work contract is required) so the application logic is tested against the same rule.
function fakeDb(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = { projects: [], events: [], agreements: [], agreement_documents: [], final_quotes: [], contacts: [], ...seed };
  const from = (table: string) => {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let ins: Row[] = [];
    const filters: ((r: Row) => boolean)[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      not: () => b,
      order: () => b,
      limit: () => b,
      update: (p: Row) => ((op = "update"), (patch = p), b),
      insert: (r: Row | Row[]) => ((op = "insert"), (ins = Array.isArray(r) ? r : [r]), b),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    async function run(): Promise<{ data?: Row[]; error?: { message: string } }> {
      if (op === "insert") {
        const made = ins.map((r) => ({ id: `${table}-${t[table].length + 1}`, ...r }));
        t[table].push(...made);
        return { data: made };
      }
      let hit = t[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of hit) {
          if (table === "projects" && patch.stage === "won" && !t.agreements.some((a) => a.project_id === r.id && a.document_type === "work_contract" && a.status === "verified"))
            return { error: { message: "projects: stage won requires a verified signed work contract" } };
          Object.assign(r, patch);
        }
        return { data: hit };
      }
      if (table === "agreements") hit = hit.map((a) => ({ ...a, agreement_documents: t.agreement_documents.filter((d) => d.agreement_id === a.id) }));
      if (table === "projects") hit = hit.map((p) => ({ ...p, contacts: t.contacts.find((c) => c.id === p.contact_id) ?? null }));
      return { data: hit };
    }
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, t };
}

const stageEvents = (t: Record<string, Row[]>) => t.events.filter((e) => e.event_type === "project.stage_changed");
const base = (stage: string) => ({
  projects: [{ id: "p1", contact_id: "c1", stage, project_type: "hardwood" }],
  contacts: [{ id: "c1", first_name: "A", last_name: "B", email: "a@b.c", phone: "1" }],
});
const returned = (type: string) => ({
  agreements: [{ id: "a1", project_id: "p1", document_type: type, status: "returned" }],
  agreement_documents: [{ id: "d1", agreement_id: "a1", document_kind: "signed_return", revision_number: 1, verified_at: null }],
});
const ctx = { projectId: "p1", contactId: "c1" };

// Scenario 1: website lead -> accepted quote -> work contract.
test("website lead: customer accepted, contract sent, then won only after the contract is verified", async () => {
  const { db, t } = fakeDb({ ...base("estimate_sent") });
  assert.equal(await advanceStage(db, ctx, "u1", "customer_accepted", "an accepted final quote is on record"), true);
  assert.equal(await advanceStage(db, ctx, "u1", "agreement_sent", "emailed"), true);
  assert.equal(t.projects[0].stage, "agreement_sent");
  Object.assign(t, returned("work_contract"));
  await verifySigned(db, "u1", "a1", "checked signatures");
  assert.equal(t.projects[0].stage, "won");
  assert.equal(stageEvents(t).length, 3);
});

// Scenario 2: customer created in Agreements, price typed by staff.
test("manual agreed price goes through the quote lifecycle and is labelled as staff-confirmed", async () => {
  const { db, t } = fakeDb({ ...base("new") });
  const id = await recordAcceptedQuote(db, "u1", ctx, { scope: "Install", exclusions: null, subtotal: 2000, tax: 100 } as never);
  assert.ok(id);
  assert.deepEqual(t.events.map((e) => e.event_type), ["final_quote.prepared", "final_quote.accepted", "project.stage_changed"]);
  assert.match(t.events[1].summary, /agreed with the customer/);
  assert.equal(t.final_quotes[0].status, "accepted");
  assert.equal(t.final_quotes[0].acceptance_recorded_by, "u1");
  assert.match(t.final_quotes[0].acceptance_note, /confirmed by staff/);
});

// Scenarios 3-5: generated / sent / uploaded but unverified.
test("generated, sent and uploaded-but-unverified work contracts never mark the project won", async () => {
  for (const status of ["generated", "sent", "returned"]) {
    const { db, t } = fakeDb({ ...base("agreement_sent"), agreements: [{ id: "a1", project_id: "p1", document_type: "work_contract", status }] });
    await assert.rejects(() => advanceStage(db, ctx, "u1", "won", "x"), (e: unknown) => /stage won requires/.test((e as { message: string }).message), status);
    assert.equal(t.projects[0].stage, "agreement_sent");
    assert.equal(stageEvents(t).length, 0);
  }
});

// Scenario 7: policy only.
test("a verified policy and liability agreement alone does not mark the project won", async () => {
  const { db, t } = fakeDb({ ...base("agreement_sent"), ...returned("policy_liability") });
  await verifySigned(db, "u1", "a1", "checked");
  assert.equal(t.agreements[0].status, "verified");
  assert.equal(t.projects[0].stage, "agreement_sent");
  assert.equal(stageEvents(t).length, 0);
});

// Scenario 8: repeats.
test("duplicate verification records one verification event and one stage change", async () => {
  const { db, t } = fakeDb({ ...base("agreement_sent"), ...returned("work_contract") });
  await verifySigned(db, "u1", "a1", "checked");
  await verifySigned(db, "u1", "a1", "checked again");
  assert.equal(t.projects[0].stage, "won");
  assert.equal(t.events.filter((e) => e.event_type === "agreement.verified").length, 1);
  assert.equal(stageEvents(t).length, 1);
});

test("a retry finishes the project stage when the first attempt stopped right after verifying the contract", async () => {
  const { db, t } = fakeDb({ ...base("agreement_sent"), agreements: [{ id: "a1", project_id: "p1", document_type: "work_contract", status: "verified" }] });
  await verifySigned(db, "u1", "a1", "retry");
  assert.equal(t.projects[0].stage, "won");
});

test("stages only move forward: later or terminal stages are left alone", async () => {
  for (const [from, target] of [["won", "agreement_sent"], ["agreement_sent", "customer_accepted"], ["lost", "customer_accepted"], ["lost", "agreement_sent"]] as const) {
    const { db, t } = fakeDb({ ...base(from) });
    assert.equal(await advanceStage(db, ctx, "u1", target, "x"), false);
    assert.equal(t.projects[0].stage, from);
  }
});

// Scenario 9: unauthorized changes.
test("every agreement server action and the signed-upload route require an admin; none sets the stage directly", () => {
  const actions = readFileSync(new URL("../../app/(app)/agreements/actions.ts", import.meta.url), "utf8");
  const exported = actions.match(/export async function \w+/g) ?? [];
  const guarded = actions.match(/await requireAdmin\(\)/g) ?? [];
  assert.equal(guarded.length, exported.length, "each exported server action calls requireAdmin");
  const signed = readFileSync(new URL("../../app/api/agreements/[id]/signed/route.ts", import.meta.url), "utf8");
  assert.match(signed, /me\.role !== "admin"[\s\S]*401/);
  assert.doesNotMatch(actions, /stage/);
});
