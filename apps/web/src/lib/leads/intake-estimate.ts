import type { NotifyContext } from "./notify";

export type EstimateInfo = NotifyContext["estimate"];

// What the customer is never told, and what staff see on the lead instead.
export const CALCULATION_FAILED_REASON = "The automatic estimate could not be calculated, so no price was given. Please quote this lead manually.";

// The estimate stage of website intake, with its side effects passed in so the failure handling can be tested without a
// database or email provider. The lead is already saved before this runs and stays saved whatever happens here.
//
// - calculate(): records the estimate revision and returns it (null info is never returned for a priced result)
// - flag(): marks the lead Needs Review, keeping reasons that are already there
// - record(): writes a timeline event for staff (safe wording only: technical detail is logged on the server, never stored on the timeline)
// - notify(): sends the customer's email: the priced estimate if `info` is a real price, otherwise an acknowledgment
export async function runEstimateStage(d: {
  calculate: () => Promise<{ info: EstimateInfo; unpricedReason: string | null }>;
  flag: (reason: string) => Promise<void>;
  record: (type: string, summary: string, details: object) => Promise<void>;
  notify: (info: EstimateInfo) => Promise<void>;
  log?: (msg: string, err: unknown) => void;
}): Promise<{ info: EstimateInfo; calculationFailed: boolean }> {
  const log = d.log ?? ((m, e) => console.error(m, e));
  let info: EstimateInfo = null;
  let calculationFailed = false;

  try {
    const r = await d.calculate();
    info = r.info;
    if (r.unpricedReason) await d.flag(`No automatic estimate was given: ${r.unpricedReason}`);
  } catch (e) {
    // Anything that goes wrong here means no estimate: never a partial or guessed one.
    calculationFailed = true;
    info = null;
    log("[intake] estimate calculation failed:", e);
    try {
      await d.flag(CALCULATION_FAILED_REASON);
    } catch (e2) {
      log("[intake] could not flag the lead for review:", e2);
    }
    try {
      await d.record("estimate.calculation_failed", "Automatic estimate failed, so no price was given", { stage: "estimate" });
    } catch (e3) {
      log("[intake] could not record the failure:", e3);
    }
  }

  // Always attempted: with no usable estimate this is the acknowledgment without a price.
  try {
    await d.notify(calculationFailed ? null : info);
  } catch (e) {
    log("[intake] customer email step failed:", e);
  }
  return { info, calculationFailed };
}
