import type { SupabaseClient } from "@supabase/supabase-js";

// The project stages that agreements and final quotes may move a project through, in order. The database CHECK
// constraint defines the full set (it also has "lost"); nothing here invents a stage.
const FORWARD = ["new", "estimate_sent", "consultation_booked", "site_visit_completed", "final_quote_sent", "customer_accepted", "agreement_sent", "won"] as const;
export type AgreementStage = "customer_accepted" | "agreement_sent" | "won";

const label = (s: string) => s.replaceAll("_", " ");

// Moves a project forward to `target`, never backwards and never out of "won" or "lost". Safe to repeat: the update only
// applies if the stage is still the one just read, and the history entry is written only when a row actually changed.
// Returns whether the stage changed. The database separately refuses "won" without a verified signed work contract.
export async function advanceStage(
  db: SupabaseClient,
  ctx: { projectId: string; contactId: string },
  adminId: string,
  target: AgreementStage,
  reason: string,
  details: Record<string, unknown> = {},
): Promise<boolean> {
  const { data: p } = await db.from("projects").select("stage").eq("id", ctx.projectId).maybeSingle();
  if (!p) return false;
  const from = p.stage as string;
  const rank = FORWARD.indexOf(from as (typeof FORWARD)[number]);
  if (rank < 0 || rank >= FORWARD.indexOf(target)) return false; // lost (unknown to the order), or already there or further on

  const up = await db.from("projects").update({ stage: target }).eq("id", ctx.projectId).eq("stage", from).select("id");
  if (up.error) throw up.error;
  if (!up.data || up.data.length === 0) return false; // another request moved it first

  await db.from("events").insert({
    contact_id: ctx.contactId,
    project_id: ctx.projectId,
    event_type: "project.stage_changed",
    summary: `Project stage changed from ${label(from)} to ${label(target)}: ${reason}`,
    details: { from, to: target, ...details },
    actor_user_id: adminId,
    source: "dashboard",
  });
  return true;
}

// Won means exactly one thing: a work contract of this project has been reviewed and verified as signed.
// A policy and liability agreement, an uploaded signed copy, or a sent contract never qualifies.
export async function syncWonFromContract(db: SupabaseClient, ctx: { projectId: string; contactId: string }, adminId: string): Promise<boolean> {
  const { data } = await db
    .from("agreements")
    .select("id")
    .eq("project_id", ctx.projectId)
    .eq("document_type", "work_contract")
    .eq("status", "verified")
    .limit(1);
  if (!data || data.length === 0) return false;
  return advanceStage(db, ctx, adminId, "won", "the signed work contract was verified", { agreement_id: data[0].id });
}
