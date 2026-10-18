import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildDigest } from "@/lib/assistant/digest";
import { emailEnabled, sendEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";

// Called on a schedule by n8n (every morning). Protected by the same shared secret as the inbound-mail endpoint.
function authorized(req: NextRequest) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailEnabled()) return NextResponse.json({ ok: false, reason: "email sending is off" }, { status: 200 });

  const to = (process.env.DIGEST_EMAILS || process.env.ALERT_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return NextResponse.json({ ok: false, reason: "no DIGEST_EMAILS or ALERT_EMAILS set" }, { status: 200 });

  try {
    const d = await buildDigest(createAdminClient());
    // One send per calendar day, even if the schedule fires twice.
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
    const r = await sendEmail({ to, subject: d.subject, html: d.html, text: d.text, idempotencyKey: `digest:${day}` });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.summary }, { status: 502 });
    return NextResponse.json({ ok: true, counts: d.counts });
  } catch (e) {
    console.error("[digest] failed:", e);
    return NextResponse.json({ error: "Could not build the digest" }, { status: 500 });
  }
}
