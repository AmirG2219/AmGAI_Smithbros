"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
