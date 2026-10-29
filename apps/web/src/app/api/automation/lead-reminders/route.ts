import { NextResponse, type NextRequest } from "next/server";
import { automationAuthorized } from "@/lib/automation/auth";
import { runLeadReminders } from "@/lib/leads/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

// Called once a day by n8n. The app decides who is due and sends the email; n8n only keeps the time.
// Add ?dry=1 to see who would be reminded without sending anything.
export async function POST(req: NextRequest) {
  if (!automationAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runLeadReminders(createAdminClient(), { dryRun: req.nextUrl.searchParams.get("dry") === "1" });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[automation] lead reminders failed:", e);
    return NextResponse.json({ error: "Reminder run failed" }, { status: 500 });
  }
}
