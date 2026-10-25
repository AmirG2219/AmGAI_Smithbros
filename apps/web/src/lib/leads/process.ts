import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceEstimate, type PricingDefinition } from "./estimate";
import type { Inquiry } from "./inquiry";
import { notifyNewLead, type NotifyContext } from "./notify";
import { runEstimateStage } from "./intake-estimate";
import { scoreLead, type ScoringRules } from "./scoring";

export type IntakeResult = {
  project_id: string;
  duplicate: boolean;
  // false if a follow-up step failed; the lead itself is always saved first.
  fully_processed: boolean;
  // The rough estimate the visitor may see on screen (null when there is none, or it must not be shown).
  estimate: { min: number; max: number; isSample: boolean } | null;
};

// Saves the lead, then scores it and records a draft estimate. The first step is the one that
// must succeed; later steps are best-effort so a customer's inquiry is never lost.
export async function processInquiry(q: Inquiry, db: ReturnType<typeof createAdminClient> = createAdminClient()): Promise<IntakeResult> {
  const requestId = randomUUID();

  const { data: intake, error } = await db.rpc("submit_website_inquiry", {
    p_submission_key: q.submission_key,
    p_first_name: q.first_name,
    p_last_name: q.last_name,
    p_email: q.email,
    p_phone: q.phone,
    p_site_city: q.city,
    p_site_postal_code: q.postal_code,
    p_additional_answers: {
      intake_form_version: "v2",
      project_type: q.project_type,
      material: q.material,
      square_footage: q.square_footage,
      timeline: q.timeline,
      rooms: q.rooms,
      species: q.species,
      pattern: q.pattern,
      finish: q.finish,
      preferred_contact: q.preferred_contact,
      notes: q.notes,
    },
    p_request_id: requestId,
  });
  if (error) throw new Error(`submit_website_inquiry failed: ${error.message}`);

  const projectId = intake.project_id as string;
  if (intake.outcome === "duplicate")
    return { project_id: projectId, duplicate: true, fully_processed: true, estimate: null };

  let ok = true;
  const failedSteps: string[] = [];
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      ok = false;
      failedSteps.push(name);
      console.error(`[intake] ${name} failed for project ${projectId}:`, e);
    }
  };

  let scoreInfo: NotifyContext["score"] = null;

  // The RPC stores the answers in additional_answers only; copy the key ones into columns for the dashboard.
  await step("project columns", async () => {
    const { error } = await db
      .from("projects")
      .update({
        project_type: q.project_type,
        material_preference: q.material,
        square_footage: q.square_footage,
        timeline_preference: q.timeline,
      })
      .eq("id", projectId);
    if (error) throw error;
  });

  await step("lead assessment", async () => {
    const { data: setting } = await db
      .from("settings")
      .select("value")
      .eq("key", "lead_scoring_rules")
      .maybeSingle();
    const rules = setting?.value as ScoringRules | undefined;

    const args = rules
      ? (() => {
          const r = scoreLead(q, rules);
          scoreInfo = { score: r.score, classification: r.classification };
          return {
            p_score: r.score,
            p_classification: r.classification,
            p_scoring_rules_version: rules.version,
            p_scoring_factors: r.factors,
            p_requires_review: false,
            p_review_reason: null,
          };
        })()
      : {
          p_score: null,
          p_classification: null,
          p_scoring_rules_version: "none",
          p_scoring_factors: {},
          p_requires_review: true,
          p_review_reason: "Lead scoring rules are not configured.",
        };

    const { error } = await db.rpc("record_lead_assessment", {
      p_project_id: projectId,
      ...args,
      p_ai_model: null,
      p_ai_prompt_version: null,
      p_ai_observations: null,
      p_request_id: requestId,
    });
    if (error) throw error;
  });

  const stage = await runEstimateStage({
    calculate: async () => {
    // Only an approved, non-placeholder rule may price a customer's estimate. Test/placeholder rules are never used.
    const { data: rule } = await db
      .from("pricing_rules")
      .select("id, version, status, is_placeholder, definition")
      .eq("status", "approved")
      .eq("is_placeholder", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const input_snapshot = {
      project_type: q.project_type,
      material: q.material,
      square_footage: q.square_footage,
    };
    const base = {
      p_project_id: projectId,
      p_currency_code: "CAD",
      p_input_snapshot: input_snapshot,
      p_request_id: requestId,
    };

    const result = rule
      ? priceEstimate(q, rule.definition as PricingDefinition)
      : ({ priced: false, reason: "No approved, non-placeholder pricing rule is available." } as const);

    const { data: recorded, error } = await db.rpc(
      "record_estimate_revision",
      result.priced && rule
        ? {
            ...base,
            p_status: "draft",
            p_price_min: result.price_min,
            p_price_max: result.price_max,
            p_tax_basis: (rule.definition as PricingDefinition).tax_basis,
            p_pricing_rule_id: rule.id,
            p_pricing_version: rule.version,
            p_pricing_snapshot: {
              pricing_rule_id: rule.id,
              version: rule.version,
              status: rule.status,
              is_placeholder: rule.is_placeholder,
              definition: rule.definition,
            },
            p_calculation_details: result.details,
            p_review_reason: null,
          }
        : {
            ...base,
            p_status: "needs_review",
            p_price_min: null,
            p_price_max: null,
            p_tax_basis: null,
            p_pricing_rule_id: null,
            p_pricing_version: null,
            p_pricing_snapshot: null,
            p_calculation_details: null,
            p_review_reason: result.priced ? "Unknown" : result.reason,
          },
    );
    if (error) throw error;
    return {
      info: {
        id: recorded.estimate_id as string,
        priced: result.priced,
        min: result.priced ? result.price_min : undefined,
        max: result.priced ? result.price_max : undefined,
        isSample: rule?.is_placeholder ?? false,
      },
      unpricedReason: result.priced ? null : result.reason,
    };
    },
    flag: (reason) => flagForReview(db, projectId, reason),
    record: async (type, summary, details) => {
      const { data: p } = await db.from("projects").select("contact_id").eq("id", projectId).single();
      const { error } = await db.from("events").insert({ contact_id: p?.contact_id, project_id: projectId, event_type: type, summary, details, source: "system" });
      if (error) throw error;
    },
    notify: (info) => notifyNewLead({ db, projectId, q, score: scoreInfo, estimate: info }),
  });
  if (stage.calculationFailed) ok = false;
  // The lead is saved, but a follow-up step did not finish: staff must see it on the lead, not only in the server log.
  if (failedSteps.length > 0)
    try {
      await flagForReview(db, projectId, `Automatic processing did not finish (${failedSteps.join(", ")}). Please check this lead's details and score by hand.`);
    } catch (e) {
      console.error(`[intake] could not flag project ${projectId} for review:`, e);
    }
  const estimateInfo = stage.info;

  // The visitor sees the range on screen only when it is a real, automatically approved estimate (never placeholder pricing).
  const info = estimateInfo;
  const estimate: IntakeResult["estimate"] =
    info?.priced && !info.isSample && info.min !== undefined && info.max !== undefined ? { min: info.min, max: info.max, isSample: false } : null;

  return { project_id: projectId, duplicate: false, fully_processed: ok, estimate };
}

// Marks the lead as needing a person's attention, keeping any reason already recorded (for example from scoring).
async function flagForReview(db: ReturnType<typeof createAdminClient>, projectId: string, reason: string) {
  const { data: p } = await db.from("projects").select("review_status, review_reason").eq("id", projectId).single();
  const existing = p?.review_status === "needs_review" ? p.review_reason : null;
  const merged = existing && !existing.includes(reason) ? `${existing} ${reason}` : (existing ?? reason);
  const { error } = await db.from("projects").update({ review_status: "needs_review", review_reason: merged }).eq("id", projectId);
  if (error) throw error;
}
