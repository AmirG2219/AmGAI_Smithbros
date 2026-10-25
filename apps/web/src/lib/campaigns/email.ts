import { createHmac, timingSafeEqual } from "node:crypto";

// Unsubscribe tokens: kept so links in marketing emails already sent keep working. Marketing sending itself has been removed.
const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sign = (recipientId: string) =>
  createHmac("sha256", secret()).update(`unsubscribe:${recipientId}`).digest("hex");

export function unsubscribeUrl(recipientId: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/unsubscribe?r=${recipientId}&t=${sign(recipientId)}`;
}

export function validUnsubscribeToken(recipientId: string, token: string) {
  const a = Buffer.from(sign(recipientId));
  const b = Buffer.from(token);
  return secret() !== "" && a.length === b.length && timingSafeEqual(a, b);
}
