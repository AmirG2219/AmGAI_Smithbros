import { NextResponse, type NextRequest } from "next/server";
import { chatEnabled, runChat, type ChatTurn } from "@/lib/assistant/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMe } from "@/lib/supabase/session";

// The dashboard chat. Only a signed-in admin may call it.
const MAX_BYTES = 60_000;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>(); // in-memory brake per signed-in user

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Browsers send an Origin on cross-site posts. Reject anything that is not our own site.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  if (!chatEnabled()) return NextResponse.json({ error: "Chat is off until an OpenAI API key is added." }, { status: 503 });

  const now = Date.now();
  const recent = (hits.get(me.id) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(me.id, recent);
  if (recent.length > MAX_PER_WINDOW) return NextResponse.json({ error: "You're going fast. Try again in a few minutes." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "That conversation is too long. Start a new one." }, { status: 413 });
  let body: { messages?: ChatTurn[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { reply } = await runChat(createAdminClient(), me.display_name, Array.isArray(body.messages) ? body.messages : []);
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[chat] failed:", e);
    return NextResponse.json({ error: "The assistant couldn't answer just now. Please try again." }, { status: 500 });
  }
}
