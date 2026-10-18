"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { MANUAL_SOURCES } from "@/lib/contacts/sources";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => {
  const v = String(f.get(k) ?? "").trim().slice(0, max);
  return v || null;
};

export async function createContact(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const fail = (error: string) => ({ error });

  const first_name = text(formData, "first_name", 100);
  const email = text(formData, "email", 254)?.toLowerCase() ?? null;
  if (!first_name) return fail("Enter a first name.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.");

  const db = createAdminClient();
  if (email) {
    const { data: existing } = await db.from("contacts").select("id").eq("email_normalized", email).maybeSingle();
    if (existing) return fail("A client with that email address already exists.");
  }

  const { error } = await db.from("contacts").insert({
    first_name,
    last_name: text(formData, "last_name", 100),
    email,
    phone: text(formData, "phone", 40),
    source: (MANUAL_SOURCES as readonly string[]).includes(String(formData.get("source"))) ? String(formData.get("source")) : "manual",
  });
  if (error) {
    console.error("[contacts] create failed:", error);
    return fail("Could not add the client. Please try again.");
  }
  redirect("/contacts?notice=added");
}
