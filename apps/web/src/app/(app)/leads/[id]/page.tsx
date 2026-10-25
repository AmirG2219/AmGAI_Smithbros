import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, FileText, Mail, Phone } from "lucide-react";
import { sourceLabel } from "@/lib/contacts/sources";
import { label } from "@/lib/leads/inquiry";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../../ui";
import { missingDetails } from "@/lib/leads/manual";
import { customerEmailReady, replyToConfigured } from "@/lib/email/reply-to";
import { emailEnabled } from "@/lib/email/resend";
import { cancelConsultation, markReviewed, scheduleConsultation, sendEstimateAction } from "./actions";
import { BookConsultation } from "./book-consultation";

const TZ = "America/Edmonton";
const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const notices: Record<string, string> = {
  booked: "Consultation booked.",
  "booked-emailed": "Consultation booked and the confirmation email was sent.",
  "booked-email-off": "Consultation booked. Email sending is off, so no confirmation was sent.",
  "booked-no-inbox": "Consultation booked, but no confirmation was sent: the company inbox address (INBOX_ADDRESS) is not set, so customer replies would go nowhere.",
  "booked-email-problem":
    "Consultation booked, but the confirmation email was not sent. See the timeline.",
  cancelled: "Consultation cancelled.",
  "lead-created": "Lead added. Nothing was priced, scored or emailed.",
  reviewed: "Marked as reviewed. Nothing about the customer or project was changed.",
  "already-reviewed": "This lead has already been reviewed.",
  "email-sent": "Email sent. It is saved on this lead's timeline.",
  "already-booked": "This lead already has a scheduled consultation. Cancel it first.",
  "estimate-sent": "Preliminary estimate emailed to the customer.",
  "estimate-unrecorded": "The email provider accepted the estimate, but its status could not be saved. Do NOT send it again; see the timeline.",
  "estimate-already-sent": "This estimate was already sent.",
  "estimate-stale": "That estimate is out of date (a newer revision exists). Nothing was sent.",
  "estimate-not-found": "That estimate could not be found.",
  "estimate-not-approved": "That estimate is not approved for sending. Nothing was sent.",
  "estimate-placeholder": "This range uses placeholder pricing, which is never sent to customers. Nothing was sent.",
  "estimate-email-off": "Email sending is not configured, so nothing was sent. The estimate can be sent once email is set up.",
  "estimate-no-email": "This customer has no email address. Nothing was sent.",
  "estimate-demo": "Not sent: demo mode only allows emails to approved test addresses.",
  "estimate-failed": "The email could not be sent. Nothing was delivered; you can try again.",
  invalid: "That didn't work. Check the date and time and try again.",
};


function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-right capitalize">{v || "—"}</span>
    </div>
  );
}

export default async function LeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();

  const [{ data: p }, { data: events }, { data: docs }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "*, contacts(first_name, last_name, email, phone), estimates(id, revision_number, status, price_min, price_max, sent_at, approved_at, pricing_version, pricing_snapshot, calculation_details, review_reason), appointments(id, status, start_at, end_at)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("events")
      .select("id, summary, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("agreements")
      .select("id, document_type, status, created_at, agreement_documents(id, document_kind)")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!p) notFound();

  const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
  const est = [...(p.estimates ?? [])]
    .filter((e: { status: string }) => e.status !== "cancelled")
    .sort((a: { revision_number: number }, b: { revision_number: number }) => b.revision_number - a.revision_number)[0];
  const demo = (await supabase.from("settings").select("value").eq("key", "demo_mode").maybeSingle()).data?.value as { enabled?: boolean } | null;
  const upcoming = (p.appointments ?? []).find((a: { status: string }) => a.status === "scheduled");
  const answers = (p.additional_answers ?? {}) as {
    notes?: string;
    lead_source?: string;
    origin?: string;
    rooms?: string[];
    species?: string[];
    pattern?: string;
    finish?: string;
    preferred_contact?: string;
  };
  const notes = answers.notes;

  const schedule = scheduleConsultation.bind(null, id);
  const resolveReview = markReviewed.bind(null, id);
  // Missing details are only listed for staff-entered leads; the website form never asks for a street address.
  const missing =
    answers.origin === "manual_lead"
      ? missingDetails(
          { project_type: p.project_type, square_footage: p.square_footage ? Number(p.square_footage) : null, timeline: p.timeline_preference, site_address_line1: p.site_address_line1 },
          !!(c?.email || c?.phone),
        )
      : [];

  return (
    <div>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> All leads
      </Link>
      <PageHeader eyebrow="Lead" title={`${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()}>
        {p.lead_classification ? (
          <Pill kind={p.lead_classification}>
            {p.lead_classification[0].toUpperCase() + p.lead_classification.slice(1)} · {p.lead_score}
          </Pill>
        ) : (
          <Pill kind="review">{p.review_status === "needs_review" ? "Needs review" : "Unrated"}</Pill>
        )}
      </PageHeader>

      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}

      {p.review_status === "needs_review" && (
        <Card className="mb-5 border-gold/50 bg-gold/10 p-5">
          <p className="eyebrow mb-2">Needs review</p>
          {p.review_reason && <p className="text-sm">{p.review_reason}</p>}
          {missing.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-medium">Still missing</p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          <form action={resolveReview} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <label htmlFor="note" className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted">Note (optional)</label>
              <input id="note" name="note" maxLength={500} placeholder="e.g. Called the customer; will confirm the size on site" className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze" />
            </div>
            <button className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze">Mark as reviewed</button>
          </form>
          <p className="mt-2 text-xs text-muted">This records that you have looked at the lead. It does not fill in missing details or change the customer.</p>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {c?.phone ? (
          <a
            href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze"
          >
            <Phone size={16} /> Call {c.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-muted">
            <Phone size={16} /> No phone number
          </span>
        )}
        {c?.email ? (
          <Link
            href={`/leads/${id}/email`}
            className="inline-flex items-center gap-2 rounded-lg border border-walnut px-4 py-2.5 text-sm font-medium transition-colors hover:bg-walnut hover:text-cream"
          >
            <Mail size={16} /> Email
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-muted">
            <Mail size={16} /> No email
          </span>
        )}
        {upcoming ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-sm text-muted">
            <CalendarCheck size={16} className="text-bronze" /> Consultation booked
          </span>
        ) : (
          <BookConsultation action={schedule} clientEmail={c?.email ?? null} />
        )}
        <Link
          href={`/documents/new?type=work_contract&project=${id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm transition-colors hover:border-bronze"
        >
          <FileText size={16} /> New contract
        </Link>
        <Link
          href={`/documents/new?type=policy_liability&project=${id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm transition-colors hover:border-bronze"
        >
          <FileText size={16} /> New agreement
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <p className="eyebrow mb-2">Contact</p>
            <Row k="Email" v={<span className="normal-case">{c?.email}</span>} />
            <Row k="Phone" v={c?.phone} />
            <Row k="Street address" v={p.site_address_line1} />
            <Row k="City" v={p.site_city} />
            <Row k="Postal code" v={p.site_postal_code} />
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-2">Project</p>
            <Row k="Type" v={p.project_type ? label(p.project_type) : null} />
            <Row k="Size" v={p.square_footage ? `${p.square_footage} sq ft` : null} />
            <Row k="Rooms" v={answers.rooms?.length ? answers.rooms.map(label).join(", ") : null} />
            <Row k="Timeline" v={p.timeline_preference ? label(p.timeline_preference) : null} />
            <Row k="Wood species" v={answers.species?.length ? answers.species.map(label).join(", ") : null} />
            <Row k="Pattern" v={answers.pattern ? label(answers.pattern) : null} />
            <Row k="Finish" v={answers.finish ? label(answers.finish) : null} />
            <Row k="Best way to reach" v={answers.preferred_contact ? label(answers.preferred_contact) : null} />
            <Row k="Source" v={sourceLabel(answers.lead_source ?? (answers.origin === "agreement_builder" ? "manual" : "website_intake"))} />
            <Row k="Stage" v={p.stage.replaceAll("_", " ")} />
            {notes && <p className="mt-3 text-sm text-muted">&ldquo;{notes}&rdquo;</p>}
            {p.review_status === "reviewed" && <p className="mt-3 text-sm text-muted">Review resolved by staff (see the timeline).</p>}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-2">Preliminary estimate</p>
            {est ? (
              <>
                <p className="font-serif text-3xl">
                  {est.price_min !== null && est.price_max !== null
                    ? `${money(est.price_min)} – ${money(est.price_max)}`
                    : "No price given"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Non-binding and subject to inspection. Not a final quote.
                </p>
                <p className="mt-2 text-sm">
                  {est.status === "sent" && est.sent_at
                    ? `Revision ${est.revision_number} · emailed to the customer ${when(est.sent_at)}`
                    : est.status === "approved"
                      ? `Revision ${est.revision_number} · generated, but NOT emailed to the customer yet`
                      : est.price_min === null
                        ? "No estimate could be calculated, so the customer received an acknowledgment without a price (see the timeline for whether it was sent)."
                        : `Revision ${est.revision_number} · ${est.status.replaceAll("_", " ")}`}
                </p>
                {est.pricing_version && (
                  <p className="mt-2 text-sm text-muted">
                    Pricing rule <span className="font-medium text-walnut">{est.pricing_version}</span>
                    {est.approved_at ? ", approved automatically by rule" : ""}
                    {est.calculation_details
                      ? ` · ${[
                          est.calculation_details.square_footage ? `${est.calculation_details.square_footage} sq ft` : null,
                          est.calculation_details.rate_per_sqft ? `$${est.calculation_details.rate_per_sqft.min}–$${est.calculation_details.rate_per_sqft.max} per sq ft` : null,
                          est.calculation_details.multiplier !== undefined ? `project type × ${est.calculation_details.multiplier}` : null,
                          est.calculation_details.minimum_applied ? `minimum job charge $${est.calculation_details.minimum_job_charge} applied` : null,
                        ].filter(Boolean).join(" · ")}`
                      : ""}
                  </p>
                )}
                {est.review_reason && <p className="mt-2 text-sm text-bronze">{est.review_reason}</p>}
                {est.status === "approved" && (
                  <div className="mt-4">
                    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-bronze">
                      {!c?.email && <li>The customer has no email address.</li>}
                      {!emailEnabled() && <li>Email sending is not configured, so it cannot be sent yet.</li>}
                      {!replyToConfigured() && <li>The company inbox address (INBOX_ADDRESS) is not set, so customer replies would not reach the Inbox.</li>}
                      {demo?.enabled && <li>Demo mode is on: emails only go to approved test addresses.</li>}
                    </ul>
                    <form action={sendEstimateAction.bind(null, id, est.id)}>
                      <button disabled={!c?.email || !customerEmailReady()} className="rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:cursor-not-allowed disabled:opacity-40">Send estimate now</button>
                    </form>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">No estimate yet.</p>
            )}
          </Card>

          {upcoming && (
            <Card className="p-5">
              <p className="eyebrow mb-3">Consultation</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-serif text-2xl">{when(upcoming.start_at)}</p>
                  <p className="mt-1 text-xs text-muted">The free visit to see the space and give an accurate quote.</p>
                </div>
                <form action={cancelConsultation.bind(null, id, upcoming.id)}>
                  <button className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:border-bronze">
                    Cancel consultation
                  </button>
                </form>
              </div>
            </Card>
          )}

          {(docs ?? []).length > 0 && (
            <Card className="p-5">
              <p className="eyebrow mb-3">Documents</p>
              <ul className="divide-y divide-line">
                {(docs ?? []).map((d) => {
                  const pdf = (d.agreement_documents as { id: string; document_kind: string }[]).find((x) => x.document_kind === "generated");
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                      <span>
                        {d.document_type === "work_contract" ? "Contract" : "Policy and liability agreement"}
                        <span className="ml-2 text-xs text-muted">{new Date(d.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Pill kind="review">{d.status}</Pill>
                        {pdf && (
                          <a href={`/api/agreements/${pdf.id}/pdf`} target="_blank" rel="noreferrer" className="text-bronze hover:text-walnut">
                            Open PDF
                          </a>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/contracts" className="mt-3 inline-block text-xs text-bronze hover:text-walnut">
                Send or manage in Documents
              </Link>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <p className="eyebrow mb-3">Timeline</p>
          <ol className="space-y-4">
            {(events ?? []).map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-sm">{e.summary}</p>
                <p className="text-xs text-muted">{when(e.created_at)}</p>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="text-sm text-muted">Nothing yet.</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}
