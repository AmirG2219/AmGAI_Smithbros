import type { SupabaseClient } from "@supabase/supabase-js";
import { brandHeader } from "@/lib/email/templates";
import { zonedToUtc } from "@/lib/timezone";
import { findUnbookedLeads, findWaitingOnCustomers } from "./waiting";

const TZ = "America/Edmonton";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? s.slice(0, n) + "…" : (s ?? ""));
const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type Digest = {
  subject: string;
  html: string;
  text: string;
  counts: { needReply: number; drafts: number; waiting: number; unbooked: number; today: number; newLeads: number };
};

type Row = { title: string; detail: string; href: string; tag?: string };

export async function buildDigest(db: SupabaseClient): Promise<Digest> {
  const now = Date.now();

  // Today in Calgary, as a UTC range.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // yyyy-mm-dd
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const start = zonedToUtc(`${today}T00:00`, TZ)!.toISOString();
  const end = zonedToUtc(`${next.toISOString().slice(0, 10)}T00:00`, TZ)!.toISOString();

  const [emails, drafts, waiting, unbooked, appts, newLeads] = await Promise.all([
    db
      .from("inbox_emails")
      .select("id, from_name, from_address, subject, priority, summary, needs_reply")
      .eq("direction", "inbound")
      .eq("status", "open")
      .order("received_at", { ascending: false })
      .limit(60),
    db.from("email_drafts").select("id, email_id").in("status", ["draft", "approved", "failed"]),
    findWaitingOnCustomers(db),
    findUnbookedLeads(db),
    db
      .from("appointments")
      .select("id, start_at, project_id, projects(contacts(first_name, last_name))")
      .eq("status", "scheduled")
      .gte("start_at", start)
      .lt("start_at", end)
      .order("start_at", { ascending: true }),
    db.from("projects").select("id", { count: "exact", head: true }).gte("created_at", new Date(now - 86_400_000).toISOString()),
  ]);

  const needReply = (emails.data ?? [])
    .filter((e) => e.needs_reply !== false)
    .sort((a, b) => (rank[a.priority ?? "normal"] ?? 2) - (rank[b.priority ?? "normal"] ?? 2));

  const sections: { title: string; rows: Row[]; more: number }[] = [];
  const push = (title: string, all: Row[], max = 6) => all.length && sections.push({ title, rows: all.slice(0, max), more: Math.max(0, all.length - max) });

  push(
    "Needs a reply",
    needReply.map((e) => ({
      title: `${e.from_name ?? e.from_address}: ${clip(e.subject || "(no subject)", 70)}`,
      detail: clip(e.summary, 200),
      href: `${appUrl()}/inbox/${e.id}`,
      tag: e.priority && e.priority !== "normal" ? e.priority : undefined,
    })),
    8,
  );
  push(
    "Today's consultations",
    (appts.data ?? []).map((a) => {
      const p = Array.isArray(a.projects) ? a.projects[0] : a.projects;
      const c = p && (Array.isArray(p.contacts) ? p.contacts[0] : p.contacts);
      return {
        title: `${new Date(a.start_at).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}: ${c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "Consultation"}`,
        detail: "",
        href: `${appUrl()}/leads/${a.project_id}`,
      };
    }),
  );
  push(
    "Waiting on customers",
    waiting.map((w) => ({
      title: `${w.name}: ${clip(w.subject || "(no subject)", 60)}`,
      detail: `You replied ${w.daysWaiting} days ago and haven't heard back.`,
      href: `${appUrl()}/inbox/${w.emailId}`,
    })),
  );
  push(
    "Estimates with no booking yet",
    unbooked.map((u) => ({
      title: u.name,
      detail: `Estimate${u.estimate ? ` (${u.estimate})` : ""} sent ${u.daysSince} days ago. No consultation booked.`,
      href: `${appUrl()}/leads/${u.id}`,
    })),
  );

  const counts = {
    needReply: needReply.length,
    drafts: drafts.data?.length ?? 0,
    waiting: waiting.length,
    unbooked: unbooked.length,
    today: appts.data?.length ?? 0,
    newLeads: newLeads.count ?? 0,
  };
  const quiet = counts.needReply + counts.waiting + counts.unbooked + counts.today === 0;
  const dateLabel = new Date().toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
  const subject = quiet
    ? `Morning brief: all clear (${dateLabel})`
    : `Morning brief: ${counts.needReply} email${counts.needReply === 1 ? " needs" : "s need"} you${counts.today ? `, ${counts.today} consultation${counts.today === 1 ? "" : "s"} today` : ""}`;

  const stat = (n: number, label: string) =>
    `<td style="padding:10px 6px;text-align:center"><div style="font-size:26px;font-family:Georgia,serif">${n}</div><div style="font-size:11px;color:#8a7b6c;letter-spacing:1px;text-transform:uppercase">${label}</div></td>`;
  const block = (s: (typeof sections)[number]) =>
    `<p style="margin:22px 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a87d53"><b>${esc(s.title)}</b></p>` +
    s.rows
      .map(
        (r) =>
          `<div style="padding:10px 0;border-bottom:1px solid #eee6d8"><a href="${esc(r.href)}" style="color:#211a16;text-decoration:none;font-weight:bold">${esc(r.title)}</a>${
            r.tag ? ` <span style="font-size:11px;color:#a87d53">[${esc(r.tag)}]</span>` : ""
          }${r.detail ? `<div style="font-size:13px;color:#5a4d42;margin-top:2px">${esc(r.detail)}</div>` : ""}</div>`,
      )
      .join("") +
    (s.more ? `<div style="font-size:12px;color:#8a7b6c;padding-top:8px">and ${s.more} more in the dashboard</div>` : "");

  const html = `<div style="background:#f5f0e8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#211a16">
<div style="max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #e8dfd0;border-radius:12px;overflow:hidden">
${brandHeader()}
<div style="padding:24px;font-size:15px;line-height:1.5">
<p style="margin:0;font-size:20px;font-family:Georgia,serif"><b>Good morning</b></p>
<p style="margin:2px 0 14px;font-size:13px;color:#8a7b6c">${esc(dateLabel)}</p>
<table style="width:100%;border-collapse:collapse;background:#f5f0e8;border-radius:8px"><tr>${stat(counts.needReply, "Need reply")}${stat(counts.drafts, "Drafts ready")}${stat(counts.waiting + counts.unbooked, "Follow-ups")}${stat(counts.newLeads, "New leads")}</tr></table>
${quiet ? `<p style="margin:22px 0">Nothing is waiting on you. Enjoy the quiet.</p>` : sections.map(block).join("")}
<p style="margin:26px 0 0"><a href="${esc(appUrl())}/inbox" style="display:inline-block;background:#d19b38;color:#211a16;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Open the dashboard</a></p>
</div></div></div>`;

  const text =
    `Good morning. ${dateLabel}\n\nNeed reply: ${counts.needReply} | Drafts ready: ${counts.drafts} | Follow-ups: ${counts.waiting + counts.unbooked} | New leads (24h): ${counts.newLeads}\n` +
    (quiet ? "\nNothing is waiting on you.\n" : sections.map((s) => `\n${s.title.toUpperCase()}\n${s.rows.map((r) => `- ${r.title}${r.detail ? `\n  ${r.detail}` : ""}\n  ${r.href}`).join("\n")}${s.more ? `\n  and ${s.more} more` : ""}`).join("\n")) +
    `\n\nDashboard: ${appUrl()}/inbox`;

  return { subject, html, text, counts };
}
