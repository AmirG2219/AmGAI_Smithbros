"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const done = (n: string) => {
  revalidatePath("/inbox/settings");
  redirect(`/inbox/settings?notice=${n}`);
};

export async function addKnowledge(kind: "faq" | "rule" | "voice_sample", formData: FormData) {
  const me = await requireAdmin();
  const content = text(formData, "content", 5000);
  const title = kind === "faq" ? text(formData, "title", 300) : "";
  if (!content || (kind === "faq" && !title)) return done("missing");
  const { error } = await createAdminClient()
    .from("assistant_knowledge")
    .insert({ kind, title: title || null, content, created_by: me.id });
  if (error) return done("failed");
  done("added");
}

// Items are switched off rather than erased, so there is always a record of what the assistant was told.
export async function removeKnowledge(id: string) {
  await requireAdmin();
  await createAdminClient().from("assistant_knowledge").update({ is_active: false }).eq("id", id);
  done("removed");
}

export async function saveSignature(formData: FormData) {
  const me = await requireAdmin();
  const content = text(formData, "content", 1000);
  if (!content) return done("missing");
  const db = createAdminClient();
  await db.from("assistant_knowledge").update({ is_active: false }).eq("kind", "signature").eq("is_active", true);
  const { error } = await db.from("assistant_knowledge").insert({ kind: "signature", content, created_by: me.id });
  if (error) return done("failed");
  done("saved");
}
