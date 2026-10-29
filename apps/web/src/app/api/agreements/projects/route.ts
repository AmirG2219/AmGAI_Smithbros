import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LIMIT = 8;
const UUID = /^[0-9a-f-]{36}$/i;

// One PostgREST `or` group for a search word: address, city, postal code, stage, type or project name.
function wordFilter(word: string) {
  const w = word.replace(/[%_,()*\\"'.:]/g, "");
  if (!w) return null;
  return [
    `site_address_line1.ilike.%${w}%`,
    `site_city.ilike.%${w}%`,
    `site_postal_code.ilike.%${w}%`,
    `stage.ilike.%${w}%`,
    `project_type.ilike.%${w}%`,
    `additional_answers->>project_name.ilike.%${w}%`,
  ].join(",");
}

// Project search for one customer in the Create Agreement picker. Every word typed must match something.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const customer = params.get("customer") ?? "";
  if (!UUID.test(customer)) return NextResponse.json({ projects: [] });
  const q = (params.get("q") ?? "").trim().slice(0, 60);

  const supabase = await createClient(); // RLS: active admins only
  let query = supabase
    .from("projects")
    .select("id, project_type, site_address_line1, site_city, stage, additional_answers")
    .eq("contact_id", customer)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  for (const word of q.split(/\s+/).slice(0, 4)) {
    const f = wordFilter(word);
    if (f) query = query.or(f);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[agreements] project search failed:", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const projects = (data ?? []).map(({ additional_answers, ...p }) => ({
    ...p,
    project_name: ((additional_answers ?? {}) as { project_name?: string }).project_name ?? null,
  }));
  return NextResponse.json({ projects }, { headers: { "Cache-Control": "private, no-store" } });
}
