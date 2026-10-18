import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_WAIT_DAYS = 3;

export type WaitingOnCustomer = {
  emailId: string; // the customer's last email to us, which is where the conversation (and a follow-up draft) lives
  name: string;
  subject: string;
  sentAt: string;
  daysWaiting: number;
};

// Customers we replied to who have not written back for N days. The work is done inside the database in one
// call, matched by the customer's address, so it works whether or not the mail provider keeps messages in one thread.
export async function findWaitingOnCustomers(db: SupabaseClient, days = DEFAULT_WAIT_DAYS): Promise<WaitingOnCustomer[]> {
  const { data, error } = await db.rpc("waiting_on_customers", { p_days: days });
  if (error) throw error;
  return ((data ?? []) as { email_id: string; name: string; subject: string; sent_at: string; days_waiting: number }[]).map((r) => ({
    emailId: r.email_id,
    name: r.name,
    subject: r.subject,
    sentAt: r.sent_at,
    daysWaiting: r.days_waiting,
  }));
}

export type UnbookedLead = { id: string; name: string; sentAt: string; daysSince: number; estimate: string | null };

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

// Leads who were emailed an estimate N or more days ago and still have no consultation.
export async function findUnbookedLeads(db: SupabaseClient, days = DEFAULT_WAIT_DAYS): Promise<UnbookedLead[]> {
  const { data, error } = await db.rpc("unbooked_leads", { p_days: days });
  if (error) throw error;
  type R = { id: string; name: string; sent_at: string; days_since: number; price_min: number | null; price_max: number | null; is_placeholder: boolean };
  return ((data ?? []) as R[]).map((r) => ({
    id: r.id,
    name: r.name || "Lead",
    sentAt: r.sent_at,
    daysSince: r.days_since,
    estimate:
      r.price_min !== null && r.price_max !== null
        ? `${money(Number(r.price_min))} to ${money(Number(r.price_max))}${r.is_placeholder ? " (sample)" : ""}`
        : null,
  }));
}
