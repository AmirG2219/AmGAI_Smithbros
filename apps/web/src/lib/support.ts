import type { HelpConfig } from "@/app/(app)/help";

// Where the dashboard's Help window points. Set per installation in the environment; leave all three empty to hide Help.
export function supportConfig(): HelpConfig | null {
  const booking = (process.env.SUPPORT_BOOKING_URL ?? "").trim();
  const email = (process.env.SUPPORT_EMAIL ?? "").trim();
  const name = (process.env.SUPPORT_NAME ?? "").trim();
  const bookingUrl = /^https:\/\//i.test(booking) ? booking : null;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  if (!bookingUrl && !validEmail) return null;
  return { bookingUrl, email: validEmail, name: name || null };
}
