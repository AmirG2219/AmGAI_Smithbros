import { NextResponse, type NextRequest } from "next/server";
import { parseInquiry } from "@/lib/leads/inquiry";
import { processInquiry } from "@/lib/leads/process";

// Public endpoint for the website's inquiry form.
// ALLOWED_ORIGINS: comma-separated website origins allowed to call this from a browser.
const MAX_BODY_BYTES = 10_000;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>(); // in-memory, per server instance: a basic brake, not a full defence

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }
  return {};
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const json = (body: object, status: number) =>
    NextResponse.json(body, { status, headers });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (rateLimited(ip)) return json({ error: "Too many requests. Try again later." }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Honeypot: real visitors never see or fill this field. Pretend success to bots.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website)
    return json({ ok: true }, 200);

  const parsed = parseInquiry(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const result = await processInquiry(parsed.value);
    // Do not echo internal ids or scores to the public.
    return json({ ok: true, received: !result.duplicate }, 200);
  } catch (e) {
    console.error("[intake] failed:", e);
    return json({ error: "We couldn't save your inquiry. Please try again." }, 500);
  }
}
