import { timingSafeEqual } from "node:crypto";

// n8n calls the automation endpoints with the same shared secret it uses for inbound email.
export function automationAuthorized(req: Request) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || expected.length < 16) return false; // refuse to run with a weak or missing secret
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
