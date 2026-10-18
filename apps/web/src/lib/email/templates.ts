import { LABELS } from "@/lib/leads/inquiry";

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
  squareFootage: number | null;
  timeline: string;
  rooms: string[];
  species: string[];
  pattern: string | null;
  finish: string | null;
  preferredContact: string | null;
  notes: string | null;
  score: number | null;
  classification: string | null;
  estimate: { min: number; max: number; isSample: boolean } | null;
  submittedAt: Date;
  dashboardUrl: string;
};

const pretty = (v: string) => LABELS[v] ?? v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

export function staffAlertEmail(i: StaffAlertInput) {
  const rating = i.classification ? `${i.classification.toUpperCase()} (${i.score})` : "Unrated";
  const rows: [string, string][] = [
    ["Name", i.name],
    ["Phone", i.phone ?? "—"],
    ["Email", i.email],
    ["Project type", pretty(i.projectType)],
    ["Square footage", i.squareFootage ? `${i.squareFootage} sq ft` : "—"],
    ["Rooms", i.rooms.length ? i.rooms.map(pretty).join(", ") : "—"],
    ["Timeline", pretty(i.timeline)],
    ["Species interest", i.species.length ? i.species.map(pretty).join(", ") : "—"],
    ["Pattern", i.pattern ? pretty(i.pattern) : "—"],
    ["Finish", i.finish ? pretty(i.finish) : "—"],
    ["City", i.city ?? "—"],
    ["Message", i.notes ?? "—"],
    ["Lead rating", rating],
  ];
  const sample = i.estimate?.isSample ? " (sample pricing)" : "";
  const range = i.estimate ? `${money(i.estimate.min)} — ${money(i.estimate.max)}` : "Needs a manual quote";
  const basis = [i.squareFootage ? `${i.squareFootage} sq ft` : null, pretty(i.projectType).toLowerCase()].filter(Boolean).join(" · ");
  const when = i.submittedAt.toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });
  const contactPref = i.preferredContact ? pretty(i.preferredContact).toLowerCase() : "not specified";

  const subject = `New lead: ${i.name} · ${i.estimate ? range : "needs quote"}`;
  const html = shell(`
<p style="font-size:20px;margin:0 0 4px;font-family:Georgia,serif"><b>New Lead from Smith Bros. Website</b></p>
<p style="margin:0 0 16px;font-size:12px;color:#8a7b6c">Submitted ${esc(when)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:9px 0;color:#8a7b6c;width:130px;vertical-align:top;border-bottom:1px solid #eee6d8">${k}</td><td style="padding:9px 0;border-bottom:1px solid #eee6d8"><b>${esc(v)}</b></td></tr>`,
  )
  .join("")}
</table>
<div style="background:#211a16;border-radius:10px;padding:18px 20px;margin:20px 0 14px">
<div style="font-size:11px;letter-spacing:2px;color:#d19b38">ESTIMATED PROJECT VALUE${esc(sample.toUpperCase())}</div>
<div style="font-size:28px;color:#f5f0e8;margin:6px 0;font-family:Georgia,serif"><b>${esc(range)}</b></div>
<div style="font-size:12px;color:#a89888">${i.estimate ? `Based on ${esc(basis)}` : "Not enough information to price automatically"}</div>
</div>
<p style="font-size:14px;margin:0 0 16px"><b>Preferred contact:</b> ${esc(contactPref)}</p>
<p style="margin:0"><a href="${esc(i.dashboardUrl)}" style="display:inline-block;background:#d19b38;color:#211a16;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Open in dashboard</a></p>`);
  const text = `New Lead from Smith Bros. Website (${when})\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nEstimated project value${sample}: ${range}${i.estimate ? ` (based on ${basis})` : ""}\nPreferred contact: ${contactPref}\n\nDashboard: ${i.dashboardUrl}`;
  return { subject, html, text };
}

export function consultationConfirmationEmail(i: {
  firstName: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
}) {
  const day = i.startAt.toLocaleDateString("en-CA", {
    timeZone: i.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-CA", { timeZone: i.timeZone, hour: "numeric", minute: "2-digit" });
  const when = `${day}, ${time(i.startAt)} – ${time(i.endAt)} (${i.timeZone.split("/").pop()?.replace("_", " ")} time)`;
  const subject = "Your Smith Bros Floors consultation is confirmed";
  const html = shell(`
<p>Hi ${esc(i.firstName)},</p>
<p>Your consultation with Smith Bros Floors is confirmed:</p>
<p style="font-size:18px;margin:16px 0"><b>${esc(when)}</b></p>
<p>We&#39;ll look at the space, talk through your options and give you an accurate quote. If you need to change the time, just reply to this email.</p>
<p style="color:#8a7b6c;font-size:13px">Smith Bros Floors</p>`);
  const text = `Hi ${i.firstName},\n\nYour consultation with Smith Bros Floors is confirmed:\n${when}\n\nWe'll look at the space, talk through your options and give you an accurate quote. If you need to change the time, just reply to this email.\n\nSmith Bros Floors`;
  return { subject, html, text };
}
