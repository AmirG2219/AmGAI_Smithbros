import type { SupabaseClient } from "@supabase/supabase-js";
import { findUnbookedLeads, findWaitingOnCustomers } from "@/lib/assistant/waiting";
import { zonedToUtc } from "@/lib/timezone";

const TZ = "America/Edmonton";
const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export type Attention = {
  replies: { id: string; who: string; subject: string; priority: string | null }[];
  replyTotal: number;
  today: { projectId: string; name: string; time: string }[];
  waiting: number;
  unbooked: number;
};

// Everything that needs the owner today, fetched in one parallel batch so the Overview stays quick.
export async function loadAttention(db: SupabaseClient): Promise<Attention> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const start = zonedToUtc(`${today}T00:00`, TZ)!.toISOString();
  const end = zonedToUtc(`${next.toISOString().slice(0, 10)}T00:00`, TZ)!.toISOString();

  const [emails, appts, waiting, unbooked] = await Promise.all([
    db
      .from("inbox_emails")
      .select("id, from_name, from_address, subject, priority")
      .eq("direction", "inbound")
      .eq("status", "open")
      .eq("needs_reply", true)
      .order("received_at", { ascending: false })
      .limit(40),
    db
      .from("appointments")
      .select("start_at, project_id, projects(contacts(first_name, last_name))")
      .eq("status", "scheduled")
      .gte("start_at", start)
      .lt("start_at", end)
      .order("start_at", { ascending: true })
      .limit(10),
    findWaitingOnCustomers(db),
    findUnbookedLeads(db),
  ]);

  const sorted = [...(emails.data ?? [])].sort((a, b) => (rank[a.priority ?? "normal"] ?? 2) - (rank[b.priority ?? "normal"] ?? 2));
  return {
    replies: sorted.slice(0, 4).map((e) => ({ id: e.id, who: e.from_name ?? e.from_address, subject: e.subject, priority: e.priority })),
    replyTotal: sorted.length,
    today: (appts.data ?? []).map((a) => {
      const p = Array.isArray(a.projects) ? a.projects[0] : a.projects;
      const c = p && (Array.isArray(p.contacts) ? p.contacts[0] : p.contacts);
      return {
        projectId: a.project_id,
        name: c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "Consultation",
        time: new Date(a.start_at).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }),
      };
    }),
    waiting: waiting.length,
    unbooked: unbooked.length,
  };
}
