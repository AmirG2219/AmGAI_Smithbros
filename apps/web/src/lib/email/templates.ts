import { LABELS } from "@/lib/leads/inquiry";

// Email content lives in code for v1. Wording is a placeholder until Paul approves the real copy.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const label = (v: string) => v.replaceAll("_", " ");

// The logo is an image the recipient's mail app downloads, so it only works once the app has a public https address.
function logoSrc() {
  const base = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
  return /^https:\/\//.test(base) ? `${base}/logo.png` : null;
}

export function brandHeader() {
  const src = logoSrc();
  return `<div style="background:#211a16;padding:18px 24px">${
    src
      ? `<img src="${esc(src)}" width="96" alt="Smith Bros Floors" style="display:block;border:0;height:auto">`
      : `<div style="font-size:11px;letter-spacing:3px;color:#d19b38">SMITH BROS FLOORS</div>`
  }</div>`;
}

function shell(inner: string) {
  return `<div style="background:#f5f0e8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#211a16">
<div style="max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #e8dfd0;border-radius:12px;overflow:hidden">
${brandHeader()}
<div style="padding:24px;font-size:15px;line-height:1.6">${inner}</div></div></div>`;
}

export type EstimateEmailInput = {
  firstName: string;
  projectType: string;
  material: string;
  squareFootage: number | null;
  min: number;
  max: number;
  bookingUrl: string | null;
};

// The automatic preliminary estimate. Always labelled as a non-binding range that depends on an on-site inspection.
export function customerEstimateEmail(i: EstimateEmailInput) {
  const range = `${money(i.min)} – ${money(i.max)} CAD`;
  const what = `${label(i.projectType)}, ${i.material}${i.squareFootage ? `, about ${i.squareFootage} sq ft` : ""}`;
  const subject = "Your Smith Bros Floors preliminary estimate";

  const html = shell(`
<p>Hi ${esc(i.firstName)},</p>
<p>Thanks for contacting Smith Bros Floors. Based on what you told us (${esc(what)}), your preliminary estimate is:</p>
<p style="font-size:26px;margin:16px 0;color:#211a16"><b>${esc(range)}</b><br><span style="font-size:12px;color:#8a7b6c">Before tax.</span></p>
<p style="background:#f5f0e8;border:1px solid #e8dfd0;padding:10px 12px;border-radius:8px;font-size:13px"><b>This is a non-binding estimate, not a quote.</b> It is subject to an on-site inspection, and the final price may be higher or lower. We will give you a written final quote after we have seen the space.</p>
<p>One of our team will be in touch to arrange your free inspection.</p>
${i.bookingUrl ? `<p><a href="${esc(i.bookingUrl)}" style="display:inline-block;background:#211a16;color:#f5f0e8;padding:12px 22px;border-radius:8px;text-decoration:none">Book your inspection</a></p>` : ""}
<p style="color:#8a7b6c;font-size:13px">Smith Bros Floors</p>`);

  const text = `Hi ${i.firstName},

Thanks for contacting Smith Bros Floors. Based on what you told us (${what}), your preliminary estimate is ${range}, before tax.

This is a non-binding estimate, not a quote. It is subject to an on-site inspection, and the final price may be higher or lower. We will give you a written final quote after we have seen the space.

One of our team will be in touch to arrange your free inspection.
${i.bookingUrl ? `Book here: ${i.bookingUrl}
` : ""}
Smith Bros Floors`;

  return { subject, html, text };
}

// Sent when we cannot give a responsible price automatically. No figure, just a promise of follow-up.
export function acknowledgmentEmail(i: { firstName: string; bookingUrl: string | null }) {
  const subject = "We received your Smith Bros Floors inquiry";
  const html = shell(`
<p>Hi ${esc(i.firstName)},</p>
<p>Thanks for contacting Smith Bros Floors. We have received the details of your project.</p>
<p>One of our team will review them and get back to you shortly to arrange a free inspection, after which we will provide an accurate quote.</p>
${i.bookingUrl ? `<p><a href="${esc(i.bookingUrl)}" style="display:inline-block;background:#211a16;color:#f5f0e8;padding:12px 22px;border-radius:8px;text-decoration:none">Book your inspection</a></p>` : ""}
<p style="color:#8a7b6c;font-size:13px">Smith Bros Floors</p>`);
  const text = `Hi ${i.firstName},

Thanks for contacting Smith Bros Floors. We have received the details of your project.

One of our team will review them and get back to you shortly to arrange a free inspection, after which we will provide an accurate quote.
${i.bookingUrl ? `Book here: ${i.bookingUrl}
` : ""}
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
  address?: string | null;
  calendar?: { google: string; outlook: string };
}) {
  const dateLong = i.startAt.toLocaleDateString("en-CA", {
    timeZone: i.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: i.timeZone, hour: "numeric", minute: "2-digit" });
  const tz = i.timeZone.split("/").pop()?.replace("_", " ") ?? "";
  const timeRange = `${time(i.startAt)} to ${time(i.endAt)} (${tz} time)`;
  const subject = `Your consultation is confirmed: ${i.startAt.toLocaleDateString("en-CA", { timeZone: i.timeZone, weekday: "long", month: "long", day: "numeric" })}`;

  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 0;color:#8a7b6c;font-size:12px;letter-spacing:1px;text-transform:uppercase;width:90px;vertical-align:top">${k}</td><td style="padding:8px 0;font-size:15px"><b>${esc(v)}</b></td></tr>`;
  const button = (href: string, text: string) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #a87d53;color:#211a16;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:14px">${text}</a>`;

  const html = shell(`
<p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#a87d53">Consultation confirmed</p>
<p style="margin:0 0 16px;font-size:24px;font-family:Georgia,serif">Hi ${esc(i.firstName)}, we&#39;ll see you soon.</p>
<p style="margin:0 0 16px">Your free consultation with Smith Bros Floors is booked. Here are the details:</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e8dfd0;border-bottom:1px solid #e8dfd0;margin:0 0 20px">
${row("Date", dateLong)}${row("Time", timeRange)}${i.address ? row("Where", i.address) : ""}
</table>
${i.calendar ? `<p style="margin:0 0 8px;font-size:13px;color:#8a7b6c">Add it to your calendar</p><div style="margin:0 0 20px">${button(i.calendar.google, "Google Calendar")}${button(i.calendar.outlook, "Outlook")}<span style="font-size:13px;color:#8a7b6c">or open the attached invite (.ics) for Apple Calendar.</span></div>` : ""}
<p style="margin:0 0 6px"><b>What to expect</b></p>
<p style="margin:0 0 16px;color:#5a4d42">We&#39;ll look at the space, talk through your options for materials and finish, and give you an accurate quote. There is no cost or obligation.</p>
<p style="margin:0 0 16px;color:#5a4d42">Need to change the time? Just reply to this email and we&#39;ll sort it out.</p>
<p style="margin:18px 0 0;color:#5a4d42">Smith Bros Floors</p>`);
  const text =
    `Hi ${i.firstName},\n\nYour free consultation with Smith Bros Floors is confirmed.\n\n` +
    `Date: ${dateLong}\nTime: ${timeRange}\n${i.address ? `Where: ${i.address}\n` : ""}` +
    (i.calendar ? `\nAdd to calendar:\nGoogle: ${i.calendar.google}\nOutlook: ${i.calendar.outlook}\nOr open the attached invite (.ics).\n` : "") +
    `\nWhat to expect: we'll look at the space, talk through your options and give you an accurate quote. There is no cost or obligation.\n\nNeed to change the time? Just reply to this email.\n\nSmith Bros Floors`;
  return { subject, html, text };
}

// A one-to-one email written by staff: plain paragraphs in the brand frame, with a signature.
export function plainEmail(args: { subject: string; body: string; signature: string }) {
  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const sig = esc(args.signature).replace(/\n/g, "<br>");
  const html = shell(`${paragraphs}<p style="margin:18px 0 0;color:#5a4d42">${sig}</p>`);
  const text = `${args.body}\n\n${args.signature}`;
  return { subject: args.subject, html, text };
}

