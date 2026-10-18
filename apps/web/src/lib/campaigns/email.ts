import { createHmac, timingSafeEqual } from "node:crypto";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// {{first_name}} and {{last_name}} are the only merge fields staff and Claude can use.
export function mergeFields(text: string, c: { first_name: string; last_name: string | null }) {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, c.first_name)
    .replace(/\{\{\s*last_name\s*\}\}/g, c.last_name ?? "");
}

// ---- Unsubscribe links: signed so only the email's recipient can use them -----------------------
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

// ---- Final email, with the footer every marketing email must carry -------------------------------
export function buildCampaignEmail(args: {
  subject: string;
  body: string; // already merged for this recipient
  recipientId: string;
}) {
  const link = unsubscribeUrl(args.recipientId);
  const address = process.env.COMPANY_ADDRESS?.trim();
  const footerText = `\n\n--\nSmith Bros Floors${address ? `, ${address}` : ""}\nYou are receiving this because you gave us permission to email you. Unsubscribe: ${link}`;
  const text = `${args.body}${footerText}`;

  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `<div style="background:#f5f0e8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#211a16">
<div style="max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #e8dfd0;border-radius:12px;overflow:hidden">
<div style="background:#211a16;color:#f5f0e8;padding:20px 24px"><div style="font-size:11px;letter-spacing:3px;color:#d19b38">SMITH BROS FLOORS</div></div>
<div style="padding:24px;font-size:15px;line-height:1.6">${paragraphs}</div>
<div style="padding:16px 24px;border-top:1px solid #e8dfd0;font-size:12px;color:#8a7b6c">Smith Bros Floors${address ? `, ${esc(address)}` : ""}<br>You are receiving this because you gave us permission to email you. <a href="${esc(link)}" style="color:#8a7b6c">Unsubscribe</a></div>
</div></div>`;

  return {
    mail: { subject: args.subject, html, text },
    headers: {
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
