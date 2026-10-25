import { emailEnabled } from "./resend";

// Where customers' replies to our emails should go: the monitored company inbox, from the INBOX_ADDRESS setting.
// Nothing is guessed. Missing or malformed, no Reply-To is set (replies then go to the sending address) and that is logged once.
const VALID = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

let warned = false;

export function replyToAddress(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = (env.INBOX_ADDRESS ?? "").trim().toLowerCase();
  if (VALID.test(raw)) return raw;
  if (!warned) {
    warned = true;
    console.warn(
      raw
        ? "[email] INBOX_ADDRESS is not a valid email address, so outgoing emails have no Reply-To."
        : "[email] INBOX_ADDRESS is not set, so outgoing emails have no Reply-To and customer replies will not reach the company inbox.",
    );
  }
  return undefined;
}

export const replyToConfigured = (env: Record<string, string | undefined> = process.env) => VALID.test((env.INBOX_ADDRESS ?? "").trim());

// Customer-facing email expects replies, so it may only go out when sending is on AND replies have somewhere monitored to land.
export const customerEmailReady = (env: Record<string, string | undefined> = process.env) => emailEnabled() && replyToConfigured(env);
