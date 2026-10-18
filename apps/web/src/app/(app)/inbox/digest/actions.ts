"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { buildDigest } from "@/lib/assistant/digest";
import { emailEnabled, sendEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmail } from "@/lib/supabase/session";

// Sends today's brief to the signed-in owner, so he can see exactly what the morning email looks like.
export async function emailBriefToMe() {
  await requireAdmin();
  if (!emailEnabled()) return redirect("/inbox/digest?notice=off");
  const to = await getEmail();
  if (!to) return redirect("/inbox/digest?notice=failed");
  const d = await buildDigest(createAdminClient());
  const r = await sendEmail({ to: [to], subject: d.subject, html: d.html, text: d.text, idempotencyKey: `digest-now:${crypto.randomUUID()}` });
  redirect(`/inbox/digest?notice=${r.ok ? "sent" : "failed"}`);
}
