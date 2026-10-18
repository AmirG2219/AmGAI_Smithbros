import type { SupabaseClient } from "@supabase/supabase-js";

export type Lesson = { ai: string; final: string; sentAt: string };

export type Learning = {
  lessons: Lesson[]; // drafts the owner changed before sending: the assistant's wording and what he actually sent
  ownerWritten: string[]; // replies he wrote entirely himself
  stats: { sent: number; edited: number };
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

// Learning needs no extra storage: every draft already keeps the assistant's original text next to what was sent.
export async function loadLearning(db: SupabaseClient, maxLessons = 5): Promise<Learning> {
  const { data } = await db
    .from("email_drafts")
    .select("source, ai_body_text, body_text, sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as { source: string; ai_body_text: string | null; body_text: string; sent_at: string }[];

  const edited = rows.filter((r) => r.source === "ai" && r.ai_body_text && norm(r.ai_body_text) !== norm(r.body_text));
  return {
    lessons: edited.slice(0, maxLessons).map((r) => ({ ai: clip(r.ai_body_text!, 1200), final: clip(r.body_text, 1200), sentAt: r.sent_at })),
    ownerWritten: rows.filter((r) => r.source === "manual").slice(0, 3).map((r) => clip(r.body_text, 800)),
    stats: { sent: rows.length, edited: edited.length },
  };
}
