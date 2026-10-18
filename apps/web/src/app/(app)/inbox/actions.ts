"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createOrRefreshDraft } from "@/lib/assistant/drafts";
import { createAdminClient } from "@/lib/supabase/admin";

// open <-> handled <-> archived. "handled_at" is set exactly when the email is not open.
export async function setEmailStatus(id: string, status: "open" | "handled" | "archived") {
  const me = await requireAdmin();
  const { error } = await createAdminClient()
    .from("inbox_emails")
    .update(
      status === "open"
        ? { status, handled_by: null, handled_at: null }
        : { status, handled_by: me.id, handled_at: new Date().toISOString() },
    )
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/inbox");
  redirect(status === "open" ? `/inbox/${id}` : "/inbox");
}

// Writes a polite nudge for a customer who has not answered. It lands as a normal draft to review and approve.
export async function draftFollowUp(emailId: string, daysWaiting: number) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(
      createAdminClient(),
      emailId,
      `They have not replied for ${daysWaiting} days. Write a short, friendly follow-up that checks in and makes it easy to reply or book a consultation. Do not repeat the whole earlier message.`,
    );
  } catch (e) {
    console.error("[assistant] follow-up draft failed:", e);
    return redirect(`/inbox/${emailId}?notice=draft-failed`);
  }
  redirect(`/inbox/${emailId}?notice=drafted`);
}
