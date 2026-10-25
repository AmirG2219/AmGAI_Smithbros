// What to show for an email we sent, from its delivery attempts only. A message record on its own proves nothing:
// it exists before any attempt is made, so a message with no recorded provider outcome is never shown as sent.
export type DeliveryRow = { status: string; accepted_at: string | null };

export function sentEmailStatus(deliveries: DeliveryRow[] | null | undefined): string {
  const d = deliveries ?? [];
  if (d.some((x) => x.status === "bounced" || x.status === "complained")) return "Bounced";
  if (d.some((x) => x.status === "delivered")) return "Delivered";
  if (d.some((x) => x.accepted_at)) return "Sent"; // accepted by the email provider
  if (d.some((x) => x.status === "queued")) return "Outcome unknown";
  if (d.some((x) => x.status === "failed")) return "Not sent";
  return "Not sent"; // no attempt was ever recorded
}
