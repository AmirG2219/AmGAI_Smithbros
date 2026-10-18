import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../../ui";
import { cancelConsultation, scheduleConsultation } from "./actions";

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
  "booked-email-problem":
    "Consultation booked, but the confirmation email was not sent. See the timeline.",
  cancelled: "Consultation cancelled.",
  "already-booked": "This lead already has a scheduled consultation. Cancel it first.",
  invalid: "That didn't work. Check the date and time and try again.",
};

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";

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

  const { data: p } = await supabase
    .from("projects")
    .select(
      "*, contacts(first_name, last_name, email, phone), estimates(revision_number, status, price_min, price_max, sent_at), appointments(id, status, start_at, end_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const { data: events } = await supabase
    .from("events")
    .select("id, summary, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
  const est = [...(p.estimates ?? [])]
    .filter((e: { status: string }) => e.status !== "cancelled")
    .sort((a: { revision_number: number }, b: { revision_number: number }) => b.revision_number - a.revision_number)[0];
  const upcoming = (p.appointments ?? []).find((a: { status: string }) => a.status === "scheduled");
  const notes = (p.additional_answers as { notes?: string } | null)?.notes;

  const schedule = scheduleConsultation.bind(null, id);

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

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <p className="eyebrow mb-2">Contact</p>
            <Row k="Email" v={<span className="normal-case">{c?.email}</span>} />
            <Row k="Phone" v={c?.phone} />
            <Row k="City" v={p.site_city} />
            <Row k="Postal code" v={p.site_postal_code} />
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-2">Project</p>
            <Row k="Type" v={p.project_type?.replaceAll("_", " ")} />
            <Row k="Material" v={p.material_preference} />
            <Row k="Size" v={p.square_footage ? `${p.square_footage} sq ft` : null} />
            <Row k="Timeline" v={p.timeline_preference?.replaceAll("_", " ")} />
            <Row k="Stage" v={p.stage.replaceAll("_", " ")} />
            {notes && <p className="mt-3 text-sm text-muted">&ldquo;{notes}&rdquo;</p>}
            {p.review_reason && <p className="mt-3 text-sm text-bronze">Review: {p.review_reason}</p>}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-2">Estimate</p>
            {est ? (
              <>
                <p className="font-serif text-3xl">
                  {est.price_min !== null && est.price_max !== null
                    ? `${money(est.price_min)} – ${money(est.price_max)}`
                    : "Needs a manual quote"}
                </p>
                <p className="mt-1 text-sm capitalize text-muted">
                  Revision {est.revision_number} · {est.status.replaceAll("_", " ")}
                  {est.sent_at ? ` · emailed ${when(est.sent_at)}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">No estimate yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Consultation</p>
            {upcoming ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-serif text-2xl">{when(upcoming.start_at)}</p>
                <form action={cancelConsultation.bind(null, id, upcoming.id)}>
                  <button className="rounded-lg border border-line px-4 py-2 text-sm hover:border-bronze">
                    Cancel consultation
                  </button>
                </form>
              </div>
            ) : (
              <form action={schedule} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-muted" htmlFor="start">
                    Date and time (Calgary)
                  </label>
                  <input id="start" name="start" type="datetime-local" required className={input} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-muted" htmlFor="minutes">
                    Length
                  </label>
                  <select id="minutes" name="minutes" defaultValue="60" className={input}>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
                <button className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
                  Book and send confirmation
                </button>
              </form>
            )}
          </Card>
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
