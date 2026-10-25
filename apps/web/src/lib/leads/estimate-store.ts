import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstimateRow, EstimateStore } from "./estimate-approval";

const COLUMNS =
  "id, project_id, revision_number, status, price_min, price_max, pricing_version, pricing_snapshot, input_snapshot, approved_at, sent_at";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function supabaseEstimateStore(db: SupabaseClient): EstimateStore {
  return {
    async load(id) {
      const { data } = await db.from("estimates").select(COLUMNS).eq("id", id).maybeSingle();
      return data ? ({ ...data, price_min: num(data.price_min), price_max: num(data.price_max) } as EstimateRow) : null;
    },
    async latestRevision(projectId) {
      const { data } = await db
        .from("estimates")
        .select("revision_number")
        .eq("project_id", projectId)
        .order("revision_number", { ascending: false })
        .limit(1);
      return data?.[0]?.revision_number ?? 0;
    },
    async transition(id, from, patch) {
      const { data, error } = await db.from("estimates").update(patch).eq("id", id).eq("status", from).select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  };
}

export async function demoModeOn(db: SupabaseClient) {
  const { data } = await db.from("settings").select("value").eq("key", "demo_mode").maybeSingle();
  return (data?.value as { enabled?: boolean } | undefined)?.enabled === true;
}
