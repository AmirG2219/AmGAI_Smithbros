import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { analyzeStoredEmail, parseInbound, storeInboundEmail } from "@/lib/assistant/inbound";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by n8n when a new email arrives in the business inbox. Protected by a shared secret.
const MAX_BYTES = 15_000_000; // room for a few attachments sent as base64

function authorized(req: NextRequest) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || expected.length < 16) return false; // refuse to run with a weak or missing secret
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseInbound(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Ignore mail from our own address (our replies, auto-forwards) so we never loop on ourselves.
  const own = (process.env.INBOX_ADDRESS ?? "").trim().toLowerCase();
  if (own && parsed.value.from_address === own) return NextResponse.json({ ok: true, ignored: "own address" });

  try {
    const db = createAdminClient();
    const stored = await storeInboundEmail(db, parsed.value);
    if (stored.id) after(() => analyzeStoredEmail(db, stored.id!));
    return NextResponse.json({ ok: true, duplicate: stored.duplicate });
  } catch (e) {
    console.error("[inbound] failed:", e);
    return NextResponse.json({ error: "Could not store email" }, { status: 500 });
  }
}
