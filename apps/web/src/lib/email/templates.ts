// Email content lives in code for v1. Wording is a placeholder until Paul approves the real copy.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const label = (v: string) => v.replaceAll("_", " ");

function shell(inner: string) {
  return `<div style="background:#f5f0e8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#211a16">
<div style="max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #e8dfd0;border-radius:12px;overflow:hidden">
<div style="background:#211a16;color:#f5f0e8;padding:20px 24px"><div style="font-size:11px;letter-spacing:3px;color:#d19b38">SMITH BROS FLOORS</div></div>
<div style="padding:24px;font-size:15px;line-height:1.6">${inner}</div></div></div>`;
}

export type EstimateEmailInput = {
  firstName: string;
  projectType: string;
  material: string;
  squareFootage: number | null;
  min: number;
  max: number;
  isSample: boolean;
  bookingUrl: string | null;
};

export function customerEstimateEmail(i: EstimateEmailInput) {
  const range = `${money(i.min)} – ${money(i.max)} CAD`;
  const what = `${label(i.projectType)}, ${i.material}${i.squareFootage ? `, about ${i.squareFootage} sq ft` : ""}`;
  const subject = `${i.isSample ? "[SAMPLE] " : ""}Your Smith Bros Floors ballpark estimate`;

  const html = shell(`
${i.isSample ? `<p style="background:#fff4d6;border:1px solid #d19b38;padding:10px 12px;border-radius:8px;font-size:13px"><b>SAMPLE ESTIMATE.</b> Demo pricing for testing only. Not a real quote.</p>` : ""}
<p>Hi ${esc(i.firstName)},</p>
<p>Thanks for contacting Smith Bros Floors. Based on what you told us (${esc(what)}), a rough ballpark for your project is:</p>
<p style="font-size:26px;margin:16px 0;color:#211a16"><b>${esc(range)}</b><br><span style="font-size:12px;color:#8a7b6c">Before tax. A ballpark, not a final quote.</span></p>
<p>The best next step is a consultation so we can see the space and give you an accurate quote.</p>
${i.bookingUrl ? `<p><a href="${esc(i.bookingUrl)}" style="display:inline-block;background:#211a16;color:#f5f0e8;padding:12px 22px;border-radius:8px;text-decoration:none">Book your consultation</a></p>` : "<p>We&#39;ll be in touch shortly to arrange a time.</p>"}
<p style="color:#8a7b6c;font-size:13px">Smith Bros Floors</p>`);

  const text = `${i.isSample ? "SAMPLE ESTIMATE - demo pricing for testing only. Not a real quote.\n\n" : ""}Hi ${i.firstName},

Thanks for contacting Smith Bros Floors. Based on what you told us (${what}), a rough ballpark for your project is ${range}, before tax. This is a ballpark, not a final quote.

The best next step is a consultation so we can see the space and give you an accurate quote.
${i.bookingUrl ? `Book here: ${i.bookingUrl}` : "We'll be in touch shortly to arrange a time."}

Smith Bros Floors`;

  return { subject, html, text };
}

export type StaffAlertInput = {
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  projectType: string;
  material: string;
  squareFootage: number | null;
  timeline: string;
  notes: string | null;
  score: number | null;
  classification: string | null;
  estimate: { min: number; max: number; isSample: boolean } | null;
  dashboardUrl: string;
};

export function staffAlertEmail(i: StaffAlertInput) {
  const rating = i.classification ? `${i.classification.toUpperCase()} (${i.score})` : "Unrated";
  const est = i.estimate
    ? `${money(i.estimate.min)} – ${money(i.estimate.max)}${i.estimate.isSample ? " (sample pricing)" : ""}`
    : "Needs a manual quote";
  const rows: [string, string][] = [
    ["Name", i.name],
    ["Email", i.email],
    ["Phone", i.phone ?? "—"],
    ["City", i.city ?? "—"],
    ["Project", `${label(i.projectType)} · ${i.material}`],
    ["Size", i.squareFootage ? `${i.squareFootage} sq ft` : "—"],
    ["Timeline", label(i.timeline)],
    ["Rating", rating],
    ["Estimate", est],
    ["Notes", i.notes ?? "—"],
  ];
  const subject = `New lead: ${i.name} · ${rating}`;
  const html = shell(`
<p style="font-size:18px;margin:0 0 12px"><b>New lead received</b></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#8a7b6c;width:90px;vertical-align:top">${k}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join("")}
</table>
<p style="margin-top:18px"><a href="${esc(i.dashboardUrl)}" style="display:inline-block;background:#211a16;color:#f5f0e8;padding:10px 20px;border-radius:8px;text-decoration:none">Open in dashboard</a></p>`);
  const text = `New lead received\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nDashboard: ${i.dashboardUrl}`;
  return { subject, html, text };
}
