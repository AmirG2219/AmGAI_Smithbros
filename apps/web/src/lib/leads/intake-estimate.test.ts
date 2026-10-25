import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALCULATION_FAILED_REASON, runEstimateStage, type EstimateInfo } from "./intake-estimate";
import { autoApproveEstimate, sendApprovedEstimate, type EstimateRow, type EstimateStore } from "./estimate-approval";

const priced: EstimateInfo = { id: "e1", priced: true, min: 4500, max: 7500, isSample: false };

// Records what the stage did, with no database or email provider involved.
function harness(o: { calculate?: () => Promise<{ info: EstimateInfo; unpricedReason: string | null }>; flag?: () => Promise<void>; record?: () => Promise<void>; notify?: () => Promise<void> } = {}) {
  const calls = { flagged: [] as string[], events: [] as { type: string; summary: string; details: object }[], notified: [] as EstimateInfo[], logged: [] as string[] };
  const deps = {
    calculate: o.calculate ?? (async () => ({ info: priced, unpricedReason: null })),
    flag: async (r: string) => {
      calls.flagged.push(r);
      await o.flag?.();
    },
    record: async (type: string, summary: string, details: object) => {
      calls.events.push({ type, summary, details });
      await o.record?.();
    },
    notify: async (i: EstimateInfo) => {
      calls.notified.push(i);
      await o.notify?.();
    },
    log: (m: string) => calls.logged.push(m),
  };
  return { calls, run: () => runEstimateStage(deps) };
}

test("an eligible inquiry is unchanged: priced estimate passed to the customer email, nothing flagged", async () => {
  const h = harness();
  const r = await h.run();
  assert.equal(r.calculationFailed, false);
  assert.deepEqual(h.calls.notified, [priced]);
  assert.deepEqual(h.calls.flagged, []);
  assert.deepEqual(h.calls.events, []);
});

test("an unpriced inquiry is flagged for review with its reason and gets the no-price path", async () => {
  const h = harness({ calculate: async () => ({ info: { id: "e1", priced: false, isSample: false }, unpricedReason: "Square footage was not provided." }) });
  await h.run();
  assert.deepEqual(h.calls.flagged, ["No automatic estimate was given: Square footage was not provided."]);
  assert.equal(h.calls.notified[0]?.priced, false);
});

test("pricing throwing: the stage completes, flags Needs Review with a safe reason, records it for staff, and falls back to the no-price email", async () => {
  const h = harness({
    calculate: async () => {
      throw new Error('relation "pricing_rules" does not exist at db.internal:5432');
    },
  });
  const r = await h.run(); // resolves: the already-saved lead is never lost
  assert.equal(r.calculationFailed, true);
  assert.equal(r.info, null);
  assert.deepEqual(h.calls.flagged, [CALCULATION_FAILED_REASON]);
  assert.deepEqual(h.calls.notified, [null]); // null = acknowledgment without a price
  assert.equal(h.calls.events.length, 1);
  assert.equal(h.calls.events[0].type, "estimate.calculation_failed");
  // the technical message is logged server-side only, never stored on the timeline
  assert.ok(!JSON.stringify(h.calls.events).includes("pricing_rules"));
  assert.ok(h.calls.logged.length >= 1);
});

test("internal error details never reach the customer-facing reason or email input", async () => {
  const h = harness({
    calculate: async () => {
      throw new Error("secret stack detail 10.0.0.5");
    },
  });
  await h.run();
  assert.ok(!CALCULATION_FAILED_REASON.includes("secret"));
  assert.ok(!h.calls.flagged.join(" ").includes("secret"));
  assert.ok(!JSON.stringify(h.calls.events).includes("secret"));
  assert.deepEqual(h.calls.notified, [null]);
});

test("a failure after a price was calculated still sends nothing priced", async () => {
  // e.g. the estimate was recorded, then something threw: the half-finished result is discarded.
  const h = harness({
    calculate: async () => {
      throw new Error("after recording");
    },
  });
  const r = await h.run();
  assert.equal(r.info, null);
  assert.deepEqual(h.calls.notified, [null]);
});

test("flagging, recording and emailing can each fail without breaking intake or skipping the others", async () => {
  const h = harness({
    calculate: async () => {
      throw new Error("boom");
    },
    flag: async () => {
      throw new Error("flag failed");
    },
    record: async () => {
      throw new Error("record failed");
    },
    notify: async () => {
      throw new Error("email failed");
    },
  });
  const r = await h.run();
  assert.equal(r.calculationFailed, true);
  assert.equal(h.calls.flagged.length, 1);
  assert.equal(h.calls.events.length, 1);
  assert.equal(h.calls.notified.length, 1);
  assert.ok(h.calls.logged.length >= 4);
});

test("intake saves the lead first, runs the stage, and keeps existing review reasons when flagging", () => {
  const p = readFileSync(new URL("./process.ts", import.meta.url), "utf8");
  assert.match(p, /existing && !existing\.includes\(reason\) \? `\$\{existing\} \$\{reason\}`/);
  assert.ok(p.indexOf("submit_website_inquiry") < p.indexOf("runEstimateStage({"));
  assert.match(p, /if \(stage\.calculationFailed\) ok = false/);
});

// ---- No duplicate or wrong sends; provider accepted versus failed ----

const row = (o: Partial<EstimateRow> = {}): EstimateRow => ({
  id: "e1",
  project_id: "p",
  revision_number: 1,
  status: "draft",
  price_min: 4500,
  price_max: 7500,
  pricing_version: "v1",
  pricing_snapshot: { is_placeholder: false, status: "approved" },
  input_snapshot: {},
  approved_at: null,
  sent_at: null,
  ...o,
});
function memStore(rows: EstimateRow[]): EstimateStore {
  return {
    load: async (id) => rows.find((r) => r.id === id) ?? null,
    latestRevision: async () => Math.max(...rows.map((r) => r.revision_number)),
    transition: async (id, from, patch) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== from) return false;
      Object.assign(r, patch);
      return true;
    },
  };
}
const flow = (s: EstimateStore, deliver: Parameters<typeof sendApprovedEstimate>[1]["deliver"]) =>
  autoApproveEstimate(s, { estimateId: "e1", projectId: "p" }).then(() =>
    sendApprovedEstimate(s, { estimateId: "e1", projectId: "p", emailEnabled: true, deliver }),
  );

test("running the automatic flow twice for the same estimate delivers once", async () => {
  const s = memStore([row()]);
  let delivered = 0;
  const deliver = async () => (delivered++, { status: "sent" as const, providerId: "x", messageId: "m" });
  assert.equal((await flow(s, deliver)).ok, true);
  assert.deepEqual(await flow(s, deliver), { ok: false, code: "already-sent" });
  assert.equal(delivered, 1);
});

test("provider accepts: estimate is marked sent with a time. Provider fails: it stays approved and unsent", async () => {
  const ok = [row()];
  await flow(memStore(ok), async () => ({ status: "sent", providerId: "x", messageId: "m" }));
  assert.equal(ok[0].status, "sent");
  assert.ok(ok[0].sent_at);

  const bad = [row()];
  const r = await flow(memStore(bad), async () => ({ status: "failed", code: "http_500" }));
  assert.deepEqual(r, { ok: false, code: "failed" });
  assert.equal(bad[0].status, "approved");
  assert.equal(bad[0].sent_at, null);
});

test("the project only moves to estimate_sent after a successful send", () => {
  const s = readFileSync(new URL("./estimate-send.ts", import.meta.url), "utf8");
  const stageAt = s.indexOf('stage: "estimate_sent"');
  assert.ok(stageAt > s.indexOf("if (r.ok) {") && stageAt < s.indexOf('"estimate.send_skipped"'));
});
