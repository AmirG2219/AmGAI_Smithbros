import { NextResponse, type NextRequest } from "next/server";
import { validUnsubscribeToken } from "@/lib/campaigns/email";
import { createAdminClient } from "@/lib/supabase/admin";

// Public. Handles both the confirmation button on /unsubscribe and mail apps' one-click unsubscribe (POST).
// The signed token proves the link came from an email we sent to that recipient.
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const r = String(form?.get("r") ?? url.searchParams.get("r") ?? "");
  const t = String(form?.get("t") ?? url.searchParams.get("t") ?? "");
  const back = (q: string) => NextResponse.redirect(new URL(`/unsubscribe?${q}`, req.url), 303);

  if (!/^[0-9a-f-]{36}$/.test(r) || !validUnsubscribeToken(r, t)) return back("error=1");

  const db = createAdminClient();
  const { data: rec } = await db
    .from("campaign_recipients")
    .select("contact_id, email_snapshot")
    .eq("id", r)
    .maybeSingle();
  if (!rec) return back("error=1");

  const ins = await db.from("suppressions").insert({
    contact_id: rec.contact_id,
    channel: "email",
    address_normalized: rec.email_snapshot,
    scope: "marketing",
    reason: "unsubscribe",
    source: "campaign_unsubscribe_link",
  });
  // 23505: already unsubscribed. Treat as success.
  if (ins.error && ins.error.code !== "23505") {
    console.error("[unsubscribe] failed:", ins.error);
    return back("error=1");
  }
  return back("done=1");
}
