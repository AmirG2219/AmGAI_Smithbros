"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { SOURCE_LABELS } from "@/lib/contacts/sources";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => {
  const v = String(f.get(k) ?? "").trim().slice(0, max);
  return v || null;
};

// Changes a client's details. The email must stay unique across clients.
export async function updateClient(id: string, formData: FormData) {
  await requireAdmin();
  const back = (notice: string) => redirect(`/contacts/${id}?notice=${notice}`);

  const first_name = text(formData, "first_name", 100);
  const email = text(formData, "email", 254)?.toLowerCase() ?? null;
  const source = String(formData.get("source") ?? "");
  if (!first_name) return back("name-needed");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back("bad-email");

  const db = createAdminClient();
  if (email) {
    const { data: other } = await db.from("contacts").select("id").eq("email_normalized", email).neq("id", id).maybeSingle();
    if (other) return back("email-taken");
  }
  const { error } = await db
    .from("contacts")
    .update({
      first_name,
      last_name: text(formData, "last_name", 100),
      email,
      phone: text(formData, "phone", 40),
      ...(source in SOURCE_LABELS ? { source } : {}),
    })
    .eq("id", id);
  if (error) {
    console.error("[clients] update failed:", error);
    return back("failed");
  }
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  back("saved");
}

export async function saveClientNotes(id: string, formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient().from("contacts").update({ notes: text(formData, "notes", 4000) }).eq("id", id);
  if (error) {
    console.error("[clients] notes failed:", error);
    redirect(`/contacts/${id}?notice=failed`);
  }
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}?notice=notes-saved`);
}
