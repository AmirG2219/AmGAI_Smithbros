import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminder, type ReminderLead } from "./reminders";
import { bookingReminderEmail } from "../email/templates";

const DAY = 86_400_000;
const now = new Date("2026-11-10T16:00:00Z");
const lead = (over: Partial<ReminderLead> & { ageDays: number }): ReminderLead => {
  const { ageDays, ...rest } = over;
  return { createdAt: new Date(now.getTime() - ageDays * DAY), stage: "new", remindersSent: 0, hasBooking: false, hasReplied: false, suppressed: false, ...rest };
};

test("nothing is sent before the lead is a day old", () => {
  assert.equal(dueReminder(lead({ ageDays: 0.5 }), now), null);
});

test("the first reminder is due after one day", () => {
  assert.equal(dueReminder(lead({ ageDays: 1.1 }), now), 1);
});

test("the second reminder waits for day 3, and for two days after the first", () => {
  const first = new Date(now.getTime() - 2.1 * DAY);
  assert.equal(dueReminder(lead({ ageDays: 2, remindersSent: 1, lastReminderAt: first }), now), null);
  assert.equal(dueReminder(lead({ ageDays: 3.2, remindersSent: 1, lastReminderAt: first }), now), 2);
  // first one went out late: no second reminder the very next day
  assert.equal(dueReminder(lead({ ageDays: 3.2, remindersSent: 1, lastReminderAt: new Date(now.getTime() - 0.5 * DAY) }), now), null);
});

test("never more than two reminders", () => {
  assert.equal(dueReminder(lead({ ageDays: 6, remindersSent: 2 }), now), null);
});

test("a booking, a reply, an unsubscribe or a later stage stops reminders", () => {
  assert.equal(dueReminder(lead({ ageDays: 2, hasBooking: true }), now), null);
  assert.equal(dueReminder(lead({ ageDays: 2, hasReplied: true }), now), null);
  assert.equal(dueReminder(lead({ ageDays: 2, suppressed: true }), now), null);
  for (const stage of ["consultation_booked", "final_quote_sent", "customer_accepted", "won", "lost"])
    assert.equal(dueReminder(lead({ ageDays: 2, stage }), now), null);
  assert.equal(dueReminder(lead({ ageDays: 2, stage: "estimate_sent" }), now), 1);
});

test("old leads are never reminded, so switching this on cannot email a backlog", () => {
  assert.equal(dueReminder(lead({ ageDays: 30 }), now), null);
});

test("the reminder email has the booking link, no price, and a way to opt out", () => {
  for (const reminder of [1, 2] as const) {
    const m = bookingReminderEmail({ firstName: "Sam", bookingUrl: "https://cal.example/book", reminder });
    assert.match(m.text, /https:\/\/cal\.example\/book/);
    assert.match(m.text, /just reply to this email/);
    assert.doesNotMatch(m.text + m.html, /\$\d/);
  }
});
