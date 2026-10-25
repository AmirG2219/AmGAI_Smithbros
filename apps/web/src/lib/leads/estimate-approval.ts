// Rules for the automatic, non-binding preliminary estimate. They live here, apart from the database and email code, so
// they can be tested with an in-memory store. The database independently enforces the same lifecycle (draft -> approved
// -> sent, frozen once approved, test pricing only in demo mode).
//
// A preliminary estimate is approved automatically by rule (no staff identity) when it was calculated from an approved,
// non-placeholder pricing rule. Anything else gets no price. A preliminary estimate is never a final quote.
import type { RecordedEmailResult } from "@/lib/email/record";

export type EstimateRow = {
  id: string;
  project_id: string;
  revision_number: number;
  status: string;
  price_min: number | null;
  price_max: number | null;
  pricing_version: string | null;
  pricing_snapshot: { is_placeholder?: boolean; status?: string } | null;
  input_snapshot: Record<string, unknown>;
  approved_at: string | null;
  sent_at: string | null;
};

export interface EstimateStore {
  load(estimateId: string): Promise<EstimateRow | null>;
  // Highest revision number the project has, whatever its status.
  latestRevision(projectId: string): Promise<number>;
  // Changes the row only if it is still in `from`. Returns false when someone else got there first.
  transition(estimateId: string, from: string, patch: Record<string, unknown>): Promise<boolean>;
}

// Placeholder or test pricing is never shown to a real customer.
export const isPlaceholder = (e: Pick<EstimateRow, "pricing_snapshot">) =>
  !e.pricing_snapshot || e.pricing_snapshot.is_placeholder === true || e.pricing_snapshot.status !== "approved";

export type AutoApproveCode = "not-found" | "not-draft" | "stale" | "no-price" | "placeholder";
export type AutoApproveResult = { ok: true } | { ok: false; code: AutoApproveCode };

// Approves a freshly calculated draft by rule. Only the newest revision of the project, only with a price, only from an
// approved non-placeholder rule. Approving does not send anything.
export async function autoApproveEstimate(
  store: EstimateStore,
  a: { estimateId: string; projectId: string; now?: Date },
): Promise<AutoApproveResult> {
  const e = await store.load(a.estimateId);
  if (!e || e.project_id !== a.projectId) return { ok: false, code: "not-found" };
  if (e.status !== "draft") return { ok: false, code: "not-draft" };
  if ((await store.latestRevision(e.project_id)) !== e.revision_number) return { ok: false, code: "stale" };
  if (e.price_min === null || e.price_max === null) return { ok: false, code: "no-price" };
  if (isPlaceholder(e)) return { ok: false, code: "placeholder" };
  const won = await store.transition(e.id, "draft", { status: "approved", approved_at: (a.now ?? new Date()).toISOString() });
  return won ? { ok: true } : { ok: false, code: "not-draft" };
}

export type SendCode = "not-found" | "not-approved" | "already-sent" | "stale" | "placeholder" | "email-off";
export type SendResult =
  | { ok: true; revision: number }
  | { ok: false; code: SendCode }
  | { ok: false; code: "skipped"; reason: string }
  | { ok: false; code: "failed" };

// Emails exactly the approved revision stored on the row: its range and inputs are read from that row, never recalculated.
export async function sendApprovedEstimate(
  store: EstimateStore,
  a: {
    estimateId: string;
    projectId: string;
    emailEnabled: boolean;
    deliver: (e: EstimateRow) => Promise<RecordedEmailResult>;
    now?: Date;
  },
): Promise<SendResult> {
  const e = await store.load(a.estimateId);
  if (!e || e.project_id !== a.projectId) return { ok: false, code: "not-found" };
  if (e.status === "sent") return { ok: false, code: "already-sent" };
  if (e.status !== "approved" || !e.approved_at || e.price_min === null || e.price_max === null) return { ok: false, code: "not-approved" };
  if (isPlaceholder(e)) return { ok: false, code: "placeholder" };
  if (!a.emailEnabled) return { ok: false, code: "email-off" };

  // A newer revision exists: this one is out of date and must never go out. It is retired so it cannot be sent later.
  if ((await store.latestRevision(e.project_id)) !== e.revision_number) {
    await store.transition(e.id, "approved", { status: "superseded" });
    return { ok: false, code: "stale" };
  }

  const r = await a.deliver(e);
  if (r.status === "skipped") return { ok: false, code: "skipped", reason: r.reason };
  if (r.status === "failed") return { ok: false, code: "failed" };

  // sent_at means "accepted by the email provider", not "delivered".
  await store.transition(e.id, "approved", { status: "sent", sent_at: (a.now ?? new Date()).toISOString() });
  return { ok: true, revision: e.revision_number };
}
