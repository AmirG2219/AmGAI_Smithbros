import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LIMIT = 8;

// One PostgREST `or` group for a search word. Digit-only words also match formatted phone numbers,
// e.g. "416555" matches "(416) 555-1234".
function wordFilter(word: string) {
  const w = word.replace(/[%_,()*\\"'.:]/g, "");
  if (!w) return null;
  const parts = [`first_name.ilike.%${w}%`, `last_name.ilike.%${w}%`, `email.ilike.%${w}%`, `phone.ilike.%${w}%`];
  if (/^\d{3,}$/.test(w)) parts.push(`phone.ilike.%${w.split("").join("%")}%`);
  return parts.join(",");
}

// Customer autocomplete for the Create Agreement picker. Every word typed must match the name, email or phone.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ customers: [] });

  const supabase = await createClient(); // RLS: active admins only
  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone")
    .order("first_name", { ascending: true })
    .limit(LIMIT);
  for (const word of q.split(/\s+/).slice(0, 4)) {
    const f = wordFilter(word);
    if (f) query = query.or(f);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[agreements] customer search failed:", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ customers: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
