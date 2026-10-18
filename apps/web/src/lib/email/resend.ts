export const emailEnabled = () =>
  process.env.EMAIL_SENDING_ENABLED === "true" &&
  !!process.env.RESEND_API_KEY &&
  !!process.env.EMAIL_FROM;

export type SendResult =
  | { ok: true; providerId: string }
  | { ok: false; code: string; summary: string };

// Minimal Resend client (one HTTP call; no SDK needed).
export async function sendEmail(msg: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  headers?: Record<string, string>;
  replyTo?: string;
}): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": msg.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.headers ? { headers: msg.headers } : {}),
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !json.id)
      return {
        ok: false,
        code: `http_${res.status}`,
        summary: (json.message ?? "Provider rejected the request").slice(0, 300),
      };
    return { ok: true, providerId: json.id };
  } catch (e) {
    return {
      ok: false,
      code: "network",
      summary: (e instanceof Error ? e.message : "Network error").slice(0, 300),
    };
  }
}
