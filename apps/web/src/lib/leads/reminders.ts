import type { SupabaseClient } from "@supabase/supabase-js";
import { customerEmailReady, replyToAddress } from "@/lib/email/reply-to";
import { sendRecordedEmail } from "@/lib/email/record";
import { bookingReminderEmail } from "@/lib/email/templates";

// Booking reminders for website leads who have not booked: one after 1 day, a last one after 3 days, then never again.
// Fixed wording, no price, no AI. n8n only triggers this once a day; every rule lives here.

const DAY = 86_400_000;
export const REMINDER_AFTER_DAYS = [1, 3] as const; // days after the inquiry arrived
export const MIN_GAP_DAYS = 2; // between one reminder and the next
export const MAX_LEAD_AGE_DAYS = 10; // older leads are left alone, so switching this on never emails a backlog
export const REMINDER_STAGES = ["new", "estimate_sent"] as const; // any later stage means someone is already working with them

export type ReminderLead = {
  createdAt: Date;
  stage: string;
  remindersSent: number; // reminders already sent for this inquiry
  lastReminderAt?: Date | null;
  hasBooking: boolean; // a consultation that is not cancelled
  hasReplied: boolean; // they emailed us after the inquiry
  suppressed: boolean; // address is on the do-not-email list
};

// Which reminder (1 or 2) is due now, or null. The first only ever follows a lead that is at least a day old.
export function dueReminder(l: ReminderLead, now: Date): 1 | 2 | null {
  if (!(REMINDER_STAGES as readonly string[]).includes(l.stage)) return null;
  if (l.hasBooking || l.hasReplied || l.suppressed) return null;
  const ageDays = (now.getTime() - l.createdAt.getTime()) / DAY;
  if (ageDays > MAX_LEAD_AGE_DAYS) return null;
  const next = l.remindersSent + 1;
  if (next > REMINDER_AFTER_DAYS.length) return null;
  if (ageDays < REMINDER_AFTER_DAYS[next - 1]) return null;
  // Never two reminders back to back, even if the first one went out late.
  if (l.lastReminderAt && now.getTime() - l.lastReminderAt.getTime() < MIN_GAP_DAYS * DAY) return null;
  return next as 1 | 2;
}

export type ReminderRun = {
  checked: number;
  due: { project_id: string; reminder: 1 | 2 }[];
  sent: number;
  skipped: number; // not delivered on purpose (demo mode allowlist and similar), tried again tomorrow
  failed: number;
  note: string | null; // set when the whole run was skipped, and why
};

const keyOf = (projectId: string, n: number) => `lead-reminder:${projectId}:${n}`;

// Finds every lead due a reminder and, unless `dryRun`, emails them. Safe to run repeatedly: each reminder has its own
// idempotency key, so a second run the same day cannot send the same one twice.
export async function runLeadReminders(db: SupabaseClient, opts: { now?: Date; dryRun?: boolean } = {}): Promise<ReminderRun> {
  const now = opts.now ?? new Date();
  const out: ReminderRun = { checked: 0, due: [], sent: 0, skipped: 0, failed: 0, note: null };
  const bookingUrl = process.env.CALENDLY_URL?.trim() || null;
  if (!bookingUrl) return { ...out, note: "No booking link is set (CALENDLY_URL), so there is nothing to remind them about." };
  if (!opts.dryRun && !customerEmailReady()) return { ...out, note: "Email sending is not fully configured, so no reminders were sent." };

  const oldest = new Date(now.getTime() - MAX_LEAD_AGE_DAYS * DAY).toISOString();
  const newest = new Date(now.getTime() - REMINDER_AFTER_DAYS[0] * DAY).toISOString();
  const { data: projects, error } = await db
    .from("projects")
    .select("id, contact_id, stage, created_at, contacts(first_name, email)")
    .in("stage", [...REMINDER_STAGES])
    .gte("created_at", oldest)
    .lte("created_at", newest)
    .limit(300);
  if (error) throw error;
  const rows = (projects ?? []).filter((p) => {
    const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    return !!c?.email;
  });
  out.checked = rows.length;
  if (!rows.length) return out;

  const ids = rows.map((p) => p.id as string);
  const contactIds = [...new Set(rows.map((p) => p.contact_id as string))];
  const emails = rows.map((p) => String((Array.isArray(p.contacts) ? p.contacts[0] : p.contacts)!.email).trim().toLowerCase());

  const [appts, sent, inbound, suppressed] = await Promise.all([
    db.from("appointments").select("project_id").in("project_id", ids).neq("status", "cancelled"),
    db.from("events").select("project_id, created_at").in("project_id", ids).eq("event_type", "lead.reminder_sent"),
    db.from("inbox_emails").select("contact_id, received_at").in("contact_id", contactIds).eq("direction", "inbound"),
    db.from("suppressions").select("address_normalized").in("address_normalized", emails).is("cleared_at", null),
  ]);
  for (const r of [appts, sent, inbound, suppressed]) if (r.error) throw r.error;

  const booked = new Set((appts.data ?? []).map((a) => a.project_id as string));
  const sentCount = new Map<string, number>();
  const lastSent = new Map<string, Date>();
  for (const e of sent.data ?? []) {
    const id = e.project_id as string;
    sentCount.set(id, (sentCount.get(id) ?? 0) + 1);
    const at = new Date(e.created_at as string);
    if (!lastSent.has(id) || at > lastSent.get(id)!) lastSent.set(id, at);
  }
  const blocked = new Set((suppressed.data ?? []).map((s) => String(s.address_normalized).toLowerCase()));

  for (const p of rows) {
    const c = (Array.isArray(p.contacts) ? p.contacts[0] : p.contacts)!;
    const email = String(c.email).trim().toLowerCase();
    const createdAt = new Date(p.created_at as string);
    const reminder = dueReminder(
      {
        createdAt,
        stage: p.stage as string,
        remindersSent: sentCount.get(p.id as string) ?? 0,
        lastReminderAt: lastSent.get(p.id as string) ?? null,
        hasBooking: booked.has(p.id as string),
        hasReplied: (inbound.data ?? []).some((m) => m.contact_id === p.contact_id && new Date(m.received_at as string) > createdAt),
        suppressed: blocked.has(email),
      },
      now,
    );
    if (!reminder) continue;
    out.due.push({ project_id: p.id as string, reminder });
    if (opts.dryRun) continue;

    const r = await sendRecordedEmail({
      db,
      contactId: p.contact_id as string,
      projectId: p.id as string,
      to: email,
      mail: bookingReminderEmail({ firstName: c.first_name ?? "there", bookingUrl, reminder }),
      idempotencyKey: keyOf(p.id as string, reminder),
      replyTo: replyToAddress(),
    });
    if (r.status === "sent") {
      out.sent++;
      await db.from("events").insert({
        contact_id: p.contact_id,
        project_id: p.id,
        event_type: "lead.reminder_sent",
        summary: `Booking reminder ${reminder} of ${REMINDER_AFTER_DAYS.length} emailed automatically`,
        details: { reminder },
        source: "email",
      });
    } else if (r.status === "skipped") out.skipped++;
    else {
      out.failed++;
      await db.from("events").insert({
        contact_id: p.contact_id,
        project_id: p.id,
        event_type: "lead.reminder_failed",
        summary: `Booking reminder ${reminder} could not be sent`,
        details: { reminder },
        source: "email",
      });
    }
  }
  return out;
}
