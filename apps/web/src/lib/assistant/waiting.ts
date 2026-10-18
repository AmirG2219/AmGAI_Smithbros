import type { SupabaseClient } from "@supabase/supabase-js";

const DAY = 86_400_000;
export const DEFAULT_WAIT_DAYS = 3;

export type WaitingOnCustomer = {
  emailId: string; // the customer's last email to us, which is where the conversation (and a follow-up draft) lives
  name: string;
  subject: string;
  sentAt: string;
  daysWaiting: number;
};

// Customers we replied to who have not written back for N days. Matched by the customer's address, so it works
// whether or not the mail provider keeps the messages in one thread.
export async function findWaitingOnCustomers(db: SupabaseClient, days = DEFAULT_WAIT_DAYS): Promise<WaitingOnCustomer[]> {
  const now = Date.now();
  const cutoff = new Date(now - days * DAY).toISOString();
  const since = new Date(now - 60 * DAY).toISOString();

  const { data: out } = await db
    .from("inbox_emails")
    .select("to_addresses, received_at")
    .eq("direction", "outbound")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(300);

  const latestOut = new Map<string, string>(); // customer address -> when we last wrote
  for (const o of out ?? []) {
    const c = (o.to_addresses as string[] | null)?.[0];
    if (c && !latestOut.has(c)) latestOut.set(c, o.received_at);
  }
  if (latestOut.size === 0) return [];

  const { data: inbound } = await db
    .from("inbox_emails")
    .select("id, from_address, from_name, subject, received_at")
    .eq("direction", "inbound")
    .in("from_address", [...latestOut.keys()])
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(600);

  const items: WaitingOnCustomer[] = [];
  for (const [customer, sentAt] of latestOut) {
    if (sentAt > cutoff) continue; // too recent to nudge
    const theirs = (inbound ?? []).filter((i) => i.from_address === customer);
    if (theirs.some((i) => i.received_at > sentAt)) continue; // they answered
    const target = theirs.find((i) => i.received_at < sentAt);
    if (!target) continue;
    items.push({
      emailId: target.id,
      name: target.from_name ?? target.from_address,
      subject: target.subject,
      sentAt,
      daysWaiting: Math.floor((now - new Date(sentAt).getTime()) / DAY),
    });
  }
  return items.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

export type UnbookedLead = { id: string; name: string; sentAt: string; daysSince: number; estimate: string | null };

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

// Leads who were emailed an estimate N or more days ago and still have no consultation.
export async function findUnbookedLeads(db: SupabaseClient, days = DEFAULT_WAIT_DAYS): Promise<UnbookedLead[]> {
  const now = Date.now();
  const cutoff = new Date(now - days * DAY).toISOString();
  const { data } = await db
    .from("projects")
    .select("id, contacts(first_name, last_name), estimates(status, sent_at, price_min, price_max, pricing_snapshot)")
    .eq("stage", "estimate_sent")
    .limit(200);

  const items: UnbookedLead[] = [];
  for (const p of data ?? []) {
    const sent = ((p.estimates ?? []) as { status: string; sent_at: string | null; price_min: number | null; price_max: number | null; pricing_snapshot: { is_placeholder?: boolean } | null }[])
      .filter((e) => e.status === "sent" && e.sent_at)
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
    if (!sent?.sent_at || sent.sent_at > cutoff) continue;
    const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    items.push({
      id: p.id,
      name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Lead",
      sentAt: sent.sent_at,
      daysSince: Math.floor((now - new Date(sent.sent_at).getTime()) / DAY),
      estimate:
        sent.price_min !== null && sent.price_max !== null
          ? `${money(sent.price_min)} to ${money(sent.price_max)}${sent.pricing_snapshot?.is_placeholder ? " (sample)" : ""}`
          : null,
    });
  }
  return items.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
