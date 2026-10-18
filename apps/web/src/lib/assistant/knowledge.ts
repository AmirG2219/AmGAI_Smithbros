import type { SupabaseClient } from "@supabase/supabase-js";

// What the owner has told the assistant: signature, standard answers, how he writes, and what it must never answer alone.
export type Knowledge = {
  signature: string | null;
  faqs: { title: string | null; content: string }[];
  voices: string[];
  rules: string[];
};

export async function loadKnowledge(db: SupabaseClient): Promise<Knowledge> {
  const { data } = await db
    .from("assistant_knowledge")
    .select("kind, title, content")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(300);
  const rows = (data ?? []) as { kind: string; title: string | null; content: string }[];
  return {
    signature: rows.find((r) => r.kind === "signature")?.content ?? null,
    faqs: rows.filter((r) => r.kind === "faq").map((r) => ({ title: r.title, content: r.content })),
    voices: rows.filter((r) => r.kind === "voice_sample").map((r) => r.content),
    rules: rows.filter((r) => r.kind === "rule").map((r) => r.content),
  };
}

export const defaultSignature = (ownerName: string) => `${ownerName}\nSmith Bros Floors`;
