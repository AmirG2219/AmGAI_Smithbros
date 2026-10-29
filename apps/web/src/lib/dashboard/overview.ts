import type { SupabaseClient } from "@supabase/supabase-js";

// Statuses where the next move belongs to staff: send a generated document, or check a signed copy that came back.
export const AGREEMENT_ACTION = ["generated", "returned"] as const;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type Person = { first_name: string; last_name: string | null };
const nameOf = (c: Person | null, fallback: string) => (c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : fallback);

// The numbers behind the sidebar badges. Each one matches what the page it points at calls "needs attention".
export type NavCounts = { leads: number; inbox: number; agreements: number };

export async function loadNavCounts(db: SupabaseClient): Promise<NavCounts> {
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [leads, inbox, agreements] = await Promise.all([
    count(db.from("projects").select("id", { count: "exact", head: true }).eq("review_status", "needs_review")),
    count(
      db
        .from("inbox_emails")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("status", "open")
        .or("needs_reply.is.null,needs_reply.eq.true"),
    ),
    count(db.from("agreements").select("id", { count: "exact", head: true }).in("status", [...AGREEMENT_ACTION])),
  ]);
  return { leads, inbox, agreements };
}

export type Overview = {
  followUp: number;
  agreementsReady: number;
  agreementsToVerify: number;
  upcomingTotal: number;
  reviewLeads: { id: string; name: string; project: string | null }[];
  agreementItems: { id: string; name: string; status: string; doc: string }[];
  recentEmails: {
    id: string;
    who: string;
    subject: string;
    preview: string;
    at: string;
    unread: boolean;
    needsReply: boolean;
  }[];
  upcoming: { projectId: string; name: string; project: string | null; at: string }[];
};

export async function loadOverview(db: SupabaseClient): Promise<Overview> {
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const nowIso = new Date().toISOString();
  const scheduled = () => db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled").gte("start_at", nowIso);

  const [followUp, ready, toVerify, upcomingTotal, review, agreements, emails, appts] = await Promise.all([
    count(db.from("projects").select("id", { count: "exact", head: true }).in("stage", ["new", "estimate_sent"])),
    count(db.from("agreements").select("id", { count: "exact", head: true }).eq("status", "generated")),
    count(db.from("agreements").select("id", { count: "exact", head: true }).eq("status", "returned")),
    count(scheduled()),
    db
      .from("projects")
      .select("id, project_type, contacts(first_name, last_name)")
      .eq("review_status", "needs_review")
      .order("created_at", { ascending: false })
      .limit(4),
    db
      .from("agreements")
      .select("id, status, document_type, projects(contacts(first_name, last_name))")
      .in("status", [...AGREEMENT_ACTION])
      .order("created_at", { ascending: false })
      .limit(4),
    // Company mail, whoever it is from: not limited to leads or projects. Several messages in one thread show once.
    db
      .from("inbox_emails")
      .select("id, from_name, from_address, subject, summary, body_text, received_at, read_at, status, needs_reply, provider_thread_id")
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(30),
    db
      .from("appointments")
      .select("project_id, start_at, projects(project_type, contacts(first_name, last_name))")
      .eq("status", "scheduled")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(5),
  ]);

  const seen = new Set<string>();
  const recentEmails = [];
  for (const e of emails.data ?? []) {
    const thread = e.provider_thread_id ?? e.id;
    if (seen.has(thread)) continue;
    seen.add(thread);
    recentEmails.push({
      id: e.id as string,
      who: (e.from_name ?? e.from_address) as string,
      subject: ((e.subject as string) || "(no subject)") as string,
      preview: ((e.summary ?? e.body_text ?? "") as string).replace(/\s+/g, " ").trim().slice(0, 110),
      at: e.received_at as string,
      unread: !e.read_at,
      needsReply: e.status === "open" && e.needs_reply !== false,
    });
    if (recentEmails.length === 5) break;
  }

  return {
    followUp,
    agreementsReady: ready,
    agreementsToVerify: toVerify,
    upcomingTotal,
    reviewLeads: (review.data ?? []).map((p) => ({
      id: p.id as string,
      name: nameOf(one(p.contacts as Person | Person[] | null), "Lead"),
      project: (p.project_type as string | null) ?? null,
    })),
    agreementItems: (agreements.data ?? []).map((a) => ({
      id: a.id as string,
      status: a.status as string,
      doc: a.document_type as string,
      name: nameOf(one(one(a.projects as unknown as { contacts: Person | Person[] | null } | null)?.contacts), "Customer"),
    })),
    recentEmails,
    upcoming: (appts.data ?? []).map((a) => {
      const p = one(a.projects as unknown as { project_type: string | null; contacts: Person | Person[] | null } | null);
      return {
        projectId: a.project_id as string,
        name: nameOf(one(p?.contacts), "Consultation"),
        project: p?.project_type ?? null,
        at: a.start_at as string,
      };
    }),
  };
}
