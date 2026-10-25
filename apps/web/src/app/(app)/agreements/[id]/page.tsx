import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FilePlus2, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { STATUS, fmtDate, pretty } from "@/lib/agreements/status";
import { defaultMessage, defaultReminder, sendBlockers, DOC_LABEL } from "@/lib/agreements/send";
import { DOC_NAME, inputsOf, missingFields, type DocType, type Snapshot } from "@/lib/agreements/vars";
import { Card } from "../../ui";
import { cancelAction, generateAction, reviseAction, sendAction, verifyAction } from "../actions";
import { ConfirmButton, CopyLink, MoreMenu, SendDialog, Submit, UploadDialog, input, labelCls, menuItem } from "../client";

type Doc = { id: string; document_kind: string; revision_number: number; size_bytes: number; created_at: string; verified_at: string | null; verification_note: string | null };
type Contact = { first_name: string; last_name: string | null; email: string | null; phone: string | null };

const NOTICES: Record<string, string> = {
  drafted: "Draft saved. Check the preview, edit anything that's wrong, then generate the PDF.",
  saved: "Draft updated.",
  generated: "The PDF is generated and ready to send.",
  cancelled: "This agreement was cancelled.",
  signed: "Signed copy uploaded and kept as evidence. It is not verified yet: review it and verify it.",
  verified: "Signed copy verified.",
  "send-sent": "Sent to the customer with the PDF attached. It is saved on their timeline.",
  "send-blocked": "Sending is switched off until email and template approval are in place.",
  "send-skipped": "Not sent: the recipient is not on the demo-mode allowlist.",
  "send-failed": "The email could not be sent. Nothing was marked as sent. Please try again.",
  "send-invalid": "That could not be sent. Check the address, subject and message.",
  "reminder-sent": "Reminder sent.",
  "reminder-blocked": "Sending is switched off until email and template approval are in place.",
  "reminder-skipped": "Not sent: the recipient is not on the demo-mode allowlist.",
  "reminder-failed": "The reminder could not be sent. Please try again.",
  "reminder-invalid": "That could not be sent. Check the address, subject and message.",
};

const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-50";
const outlineBtn = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm hover:border-bronze";

// The action this document needs next: first on phones, rightmost beside the other buttons on wider screens.
const Primary = ({ children }: { children: React.ReactNode }) => <div className="order-first sm:order-none">{children}</div>;

export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; view?: string }>;
}) {
  const { id } = await params;
  const { notice, error, view } = await searchParams;
  const supabase = await createClient();

  const { data: a } = await supabase
    .from("agreements")
    .select(
      `id, project_id, document_type, status, sent_at, verified_at, created_at, rendered_data_snapshot,
       projects(project_type, site_address_line1, contacts(first_name, last_name, email, phone)),
       agreement_template_versions(version_number, agreement_templates(name)),
       agreement_documents(id, document_kind, revision_number, size_bytes, created_at, verified_at, verification_note)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();

  const type = a.document_type as DocType;
  const snap = a.rendered_data_snapshot as Snapshot;
  const project = (Array.isArray(a.projects) ? a.projects[0] : a.projects) as { project_type: string | null; contacts: Contact | Contact[] | null } | null;
  const c = (Array.isArray(project?.contacts) ? project?.contacts[0] : project?.contacts) as Contact | undefined;
  const tv = (Array.isArray(a.agreement_template_versions) ? a.agreement_template_versions[0] : a.agreement_template_versions) as { version_number: number; agreement_templates: { name: string } | { name: string }[] } | null;
  const tplName = (Array.isArray(tv?.agreement_templates) ? tv?.agreement_templates[0]?.name : tv?.agreement_templates?.name) ?? "";

  const docs = (a.agreement_documents as Doc[]).slice().sort((x, y) => x.created_at.localeCompare(y.created_at));
  const generated = docs.find((d) => d.document_kind === "generated");
  const signed = docs.filter((d) => d.document_kind === "signed_return");
  const shown = docs.find((d) => d.id === view) ?? generated;

  const [{ data: events }, { data: sibling }, { data: next }] = await Promise.all([
    supabase.from("events").select("id, summary, created_at").eq("details->>agreement_id", id).order("created_at", { ascending: false }),
    supabase
      .from("agreements")
      .select("id, document_type, status")
      .eq("project_id", a.project_id)
      .neq("document_type", type)
      .in("status", ["draft", "generated", "sent"]),
    supabase.from("agreements").select("id").eq("rendered_data_snapshot->>_revision_of", id).maybeSingle(),
  ]);
  const other = sibling?.[0];
  const otherSendable = other && ["generated", "sent"].includes(other.status) ? other : null;

  const status = a.status as string;
  const st = STATUS[status];
  const revision = snap._revision ?? 1;
  const missing = status === "draft" ? missingFields(type, inputsOf(snap)) : [];
  const blockers = sendBlockers([tplName]);
  const live = ["generated", "sent", "returned", "verified"].includes(status);
  const previewSrc = status === "draft" ? `/api/agreements/${id}/preview` : shown ? `/api/agreements/${shown.id}/pdf` : null;
  const address = typeof snap.site_address === "string" && snap.site_address !== "[to be completed]" ? snap.site_address : null;
  const email = c?.email ?? null;

  const alsoOption = otherSendable ? { id: otherSendable.id, label: `Also attach the ${DOC_LABEL[otherSendable.document_type]} and send both in one email` } : undefined;
  const sendDialog = (opts: { reminder: boolean; primary: boolean }) =>
    email && (
      <SendDialog
        compact
        primary={opts.primary}
        action={sendAction.bind(null, id, opts.reminder)}
        title={opts.reminder ? "Send reminder" : status === "sent" ? "Send again" : "Send to customer"}
        button={opts.reminder ? "Send reminder" : status === "sent" ? "Send again" : "Send to customer"}
        defaultTo={email}
        subject={`${opts.reminder ? "Reminder: your" : "Your"} Smith Bros Floors ${DOC_LABEL[type]}`}
        message={opts.reminder ? defaultReminder(c!.first_name, [type]) : defaultMessage(c!.first_name, [type])}
        blockers={blockers}
        alsoOption={opts.reminder ? undefined : alsoOption}
      />
    );

  return (
    <div className="mx-auto max-w-[88rem]">
      <Link href="/agreements" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Agreements
      </Link>

      {/* Title, status and the one action this document needs next */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">{DOC_NAME[type]} · Revision {revision}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-serif text-3xl sm:text-4xl">{c?.first_name} {c?.last_name}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${st?.tone}`}>{st?.label}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{pretty(project?.project_type)}{address ? ` · ${address}` : ""}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" && (
            <>
              {missing.length === 0 && (
                <Link href={`/agreements/${id}/edit`} className={outlineBtn}><Pencil size={14} /> Edit draft</Link>
              )}
              <Primary>
                {missing.length > 0 ? (
                  <Link href={`/agreements/${id}/edit`} className={primaryBtn}><Pencil size={14} /> Edit draft</Link>
                ) : (
                  <form action={generateAction.bind(null, id)}>
                    <Submit pending="Generating…" className={primaryBtn}>Generate PDF</Submit>
                  </form>
                )}
              </Primary>
            </>
          )}
          {status === "generated" && <Primary>{sendDialog({ reminder: false, primary: true })}</Primary>}
          {status === "sent" && (
            <>
              {sendDialog({ reminder: true, primary: false })}
              {sendDialog({ reminder: false, primary: false })}
              <Primary>
                <UploadDialog action={`/api/agreements/${id}/signed`} primary label="Upload signed copy" />
              </Primary>
            </>
          )}
          {status === "returned" && (
            <>
              <UploadDialog action={`/api/agreements/${id}/signed`} primary={false} label="Upload another copy" />
              <Primary>
                <a href="#verify" className={primaryBtn}><ShieldCheck size={14} /> Review and verify</a>
              </Primary>
            </>
          )}
          {status === "generated" && <UploadDialog action={`/api/agreements/${id}/signed`} primary={false} label="Upload signed copy" />}
          {status === "verified" && shown && (
            <Primary>
              <a href={`/api/agreements/${shown.id}/pdf?download=1`} className={primaryBtn}><Download size={14} /> Download PDF</a>
            </Primary>
          )}

          {(live || status === "draft") && (
            <MoreMenu>
              {live && generated && <CopyLink documentId={generated.id} menu />}
              {shown && status !== "verified" && (
                <a href={`/api/agreements/${shown.id}/pdf?download=1`} className={menuItem}><Download size={14} /> Download PDF</a>
              )}
              {live && (
                <form action={reviseAction.bind(null, id)}>
                  <ConfirmButton
                    className={menuItem}
                    message={
                      status === "verified"
                        ? "This agreement is already verified. A revision retires it and starts a new draft that must be sent, signed and verified again. Continue?"
                        : "Start a revision? This retires the current version (its PDFs are kept) and opens a new draft."
                    }
                  >
                    <FilePlus2 size={14} /> Create revision
                  </ConfirmButton>
                </form>
              )}
              {["draft", "generated", "sent", "returned"].includes(status) && (
                <form action={cancelAction.bind(null, id)}>
                  <ConfirmButton message="Cancel this agreement? It will be kept in the archive." className={`${menuItem} text-red-700 hover:bg-red-50`}>
                    <XCircle size={14} /> Cancel agreement
                  </ConfirmButton>
                </form>
              )}
            </MoreMenu>
          )}
        </div>
      </header>

      {notice && NOTICES[notice] && <p className="mb-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm">{NOTICES[notice]}</p>}
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      {["generated", "sent"].includes(status) && !email && (
        <p className="mb-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-muted">The customer has no email address on file, so this can&apos;t be sent from here.</p>
      )}
      {missing.length > 0 && (
        <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Still needed before the PDF can be generated: {missing.join(", ")}.</p>
      )}
      {["generated", "sent"].includes(status) && blockers.length > 0 && (
        <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <strong>Sending is switched off.</strong> {blockers.join(" ")}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm">
              <span className="text-muted">
                {status === "draft" ? "Draft preview (not saved as a PDF yet)" : shown?.document_kind === "signed_return" ? `Signed copy ${shown.revision_number}` : "Generated PDF"}
              </span>
              {signed.length > 0 && (
                <span className="flex gap-3">
                  {generated && <Link href={`/agreements/${id}`} className={shown?.id === generated.id ? "font-medium text-walnut" : "text-bronze"}>Generated</Link>}
                  {signed.map((d) => (
                    <Link key={d.id} href={`/agreements/${id}?view=${d.id}`} className={shown?.id === d.id ? "font-medium text-walnut" : "text-bronze"}>
                      Signed {d.revision_number}
                    </Link>
                  ))}
                </span>
              )}
            </div>
            {previewSrc ? (
              <iframe key={previewSrc} src={previewSrc} title="Document preview" className="h-[80vh] min-h-[30rem] w-full bg-stone-100" />
            ) : (
              <p className="px-6 py-16 text-center text-sm text-muted">No PDF to show.</p>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5">
              <p className="eyebrow mb-3">Documents</p>
              {docs.length === 0 ? (
                <p className="text-sm text-muted">No PDF generated yet.</p>
              ) : (
                <ul className="grid gap-3 text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        {d.document_kind === "signed_return" ? `Signed copy ${d.revision_number}` : "Generated PDF"}
                        <span className="block text-xs text-muted">
                          {fmtDate(d.created_at)} · {Math.max(1, Math.round(d.size_bytes / 1024))} KB
                          {d.document_kind === "signed_return" && (d.verified_at ? ` · verified ${fmtDate(d.verified_at)}` : " · not verified")}
                        </span>
                        {d.verification_note && <span className="block text-xs text-muted">Note: {d.verification_note}</span>}
                      </span>
                      <a href={`/api/agreements/${d.id}/pdf`} target="_blank" rel="noreferrer" className="shrink-0 text-bronze hover:text-walnut">Open</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <p className="eyebrow mb-3">History</p>
              {(events ?? []).length === 0 ? (
                <p className="text-sm text-muted">Nothing recorded yet.</p>
              ) : (
                <ol className="grid gap-3 border-l border-line pl-4 text-sm">
                  {(events ?? []).map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-bronze" />
                      {e.summary}
                      <span className="block text-xs text-muted">{fmtDate(e.created_at, true)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>

        <aside className="grid content-start gap-5 lg:sticky lg:top-6 lg:self-start">
          {status === "returned" && (
            <Card id="verify" className="scroll-mt-6 border-violet-200 p-5">
              <p className="eyebrow mb-1 flex items-center gap-2"><ShieldCheck size={14} /> Review signed copy</p>
              <p className="mb-3 text-sm text-muted">Open the Signed tab in the preview and check it is complete and signed by the customer.</p>
              <form action={verifyAction.bind(null, id)} className="grid gap-3">
                <div>
                  <label className={labelCls} htmlFor="note">What did you check?</label>
                  <textarea id="note" name="note" rows={3} required placeholder="e.g. Signed and dated on every page" className={input} />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" required className="mt-1" />
                  <span>I have reviewed the signed copy and confirm it is valid.</span>
                </label>
                <Submit pending="Verifying…">Verify signed document</Submit>
              </form>
              {type === "work_contract" && <p className="mt-3 text-xs text-muted">A verified work contract is what allows the project to be marked Won.</p>}
            </Card>
          )}

          <Card className="p-5">
            <p className="eyebrow mb-3">Details</p>
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">Email</dt><dd className="break-words">{c?.email ?? "—"}</dd>
              <dt className="text-muted">Phone</dt><dd>{c?.phone ?? "—"}</dd>
              {typeof snap.total === "string" && type === "work_contract" && (
                <>
                  <dt className="text-muted">Total</dt><dd>{snap.total}</dd>
                  <dt className="text-muted">Deposit</dt><dd>{String(snap.deposit_amount)}</dd>
                  <dt className="text-muted">Balance</dt><dd>{String(snap.balance_amount)}</dd>
                </>
              )}
              <dt className="text-muted">Template</dt><dd className="break-words">{tplName} v{tv?.version_number}</dd>
              <dt className="text-muted">Created</dt><dd>{fmtDate(a.created_at)}</dd>
              <dt className="text-muted">Sent</dt><dd>{fmtDate(a.sent_at)}</dd>
              <dt className="text-muted">Verified</dt><dd>{fmtDate(a.verified_at)}</dd>
              {snap._revision_of && (<><dt className="text-muted">Revises</dt><dd><Link href={`/agreements/${snap._revision_of}`} className="text-bronze hover:text-walnut">Earlier version</Link></dd></>)}
              {next && (<><dt className="text-muted">Replaced by</dt><dd><Link href={`/agreements/${next.id}`} className="text-bronze hover:text-walnut">Newer revision</Link></dd></>)}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
