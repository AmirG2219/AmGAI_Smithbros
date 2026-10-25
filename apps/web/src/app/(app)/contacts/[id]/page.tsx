import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Mail, Phone } from "lucide-react";
import { sourceLabel } from "@/lib/contacts/sources";
import { sentEmailStatus } from "@/lib/email/status";
import { loadContactConversations } from "@/lib/inbox/links";
import { createClient } from "@/lib/supabase/server";
import { ConversationList } from "../../conversation-list";
import { Card, PageHeader, Pill } from "../../ui";
import { saveClientNotes, updateClient } from "./actions";
import { EditClient } from "./edit-client";

const notices: Record<string, string> = {
  saved: "Client updated.",
  "notes-saved": "Notes saved.",
  "name-needed": "A first name is required.",
  "bad-email": "That email address doesn't look right.",
  "email-taken": "Another client already uses that email address.",
  failed: "That didn't save. Please try again.",
};

const TZ = "America/Edmonton";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const btn = "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors";

type Doc = { id: string; document_type: string; status: string; created_at: string; agreement_documents: { id: string; document_kind: string }[] };
type Est = { status: string; price_min: number | null; price_max: number | null; revision_number: number };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  // Everything loads in one parallel batch (one round trip to the database, not four).
  const [{ data: c }, { data: jobs }, { data: events }, { data: mails }, conversations] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, source, notes, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select(
        "id, project_type, stage, site_city, created_at, estimates(status, price_min, price_max, revision_number), agreements(id, document_type, status, created_at, agreement_documents(id, document_kind))",
      )
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("events").select("id, summary, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(30),
    // One round trip: this client's email messages, found through their conversations.
    supabase
      .from("messages")
      .select("id, direction, subject, created_at, conversations!inner(contact_id, channel), message_deliveries(status, accepted_at)")
      .eq("conversations.contact_id", id)
      .eq("conversations.channel", "email")
      .order("created_at", { ascending: false })
      .limit(12),
    // Inbox conversations from this client's address (runs as the signed-in user, so row security applies).
    loadContactConversations(supabase, id),
  ]);
  if (!c) notFound();

  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  const latestJob = jobs?.[0];
  const docs = (jobs ?? []).flatMap((j) => (j.agreements ?? []) as Doc[]);
  const target = latestJob ? `project=${latestJob.id}` : `client=${id}`;

  return (
    <div>
      <Link href="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Contacts
      </Link>
      <PageHeader eyebrow="Client" title={name}>
        <Pill kind="review">{sourceLabel(c.source)}</Pill>
      </PageHeader>

      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {c.phone ? (
          <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
            <Phone size={16} /> Call {c.phone}
          </a>
        ) : (
          <span className={`${btn} border border-line font-normal text-muted`}>
            <Phone size={16} /> No phone number
          </span>
        )}
        {c.email ? (
          latestJob ? (
            <Link href={`/leads/${latestJob.id}/email`} className={`${btn} border border-walnut hover:bg-walnut hover:text-cream`}>
              <Mail size={16} /> Email
            </Link>
          ) : (
            <a href={`mailto:${c.email}`} className={`${btn} border border-walnut hover:bg-walnut hover:text-cream`}>
              <Mail size={16} /> Email
            </a>
          )
        ) : (
          <span className={`${btn} border border-line font-normal text-muted`}>
            <Mail size={16} /> No email
          </span>
        )}
        <Link href={`/documents/new?type=work_contract&${target}`} className={`${btn} border border-line font-normal hover:border-bronze`}>
          <FileText size={16} /> New contract
        </Link>
        <Link href={`/documents/new?type=policy_liability&${target}`} className={`${btn} border border-line font-normal hover:border-bronze`}>
          <FileText size={16} /> New agreement
        </Link>
        <EditClient action={updateClient.bind(null, id)} client={c} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <p className="eyebrow mb-3">Details</p>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Email</dt>
                <dd>{c.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Phone</dt>
                <dd>{c.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Came from</dt>
                <dd>{sourceLabel(c.source)}</dd>
              </div>
              <div>
                <dt className="text-muted">Added</dt>
                <dd>{day(c.created_at)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Notes</p>
            <form action={saveClientNotes.bind(null, id)} className="grid gap-3">
              <textarea
                name="notes"
                rows={4}
                maxLength={4000}
                defaultValue={c.notes ?? ""}
                placeholder="Private notes, e.g. dog in the house, call before 5pm"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze"
              />
              <button className="w-fit rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream hover:bg-bronze">Save notes</button>
            </form>
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Jobs</p>
            {(jobs ?? []).length === 0 ? (
              <p className="text-sm text-muted">No jobs yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(jobs ?? []).map((j) => {
                  const est = ((j.estimates ?? []) as Est[])
                    .filter((e) => e.status !== "cancelled")
                    .sort((a, b) => b.revision_number - a.revision_number)[0];
                  return (
                    <li key={j.id}>
                      <Link
                        href={`/leads/${j.id}`}
                        className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-cream"
                      >
                        <span>
                          <span className="font-medium capitalize">{j.project_type?.replaceAll("_", " ") ?? "Project"}</span>
                          <span className="ml-2 text-xs text-muted">
                            {j.site_city ?? ""} {day(j.created_at)}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          {est?.price_min != null && est?.price_max != null && (
                            <span className="text-muted">
                              {money(Number(est.price_min))} to {money(Number(est.price_max))}
                            </span>
                          )}
                          <span className="capitalize">{j.stage.replaceAll("_", " ")}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Documents</p>
            {docs.length === 0 ? (
              <p className="text-sm text-muted">No contracts or agreements yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {docs.map((d) => {
                  const pdf = d.agreement_documents.find((x) => x.document_kind === "generated");
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                      <span>
                        {d.document_type === "work_contract" ? "Contract" : "Policy and liability agreement"}
                        <span className="ml-2 text-xs text-muted">{day(d.created_at)}</span>
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
            )}
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-3">Emails</p>
            {(mails ?? []).length === 0 ? (
              <p className="text-sm text-muted">No emails yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(mails ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs text-muted">{m.direction === "outbound" ? sentEmailStatus(m.message_deliveries) : "Received"}</span>
                      {m.subject || "(no subject)"}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{day(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ConversationList items={conversations} empty="No Inbox conversations from this client yet." />
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
