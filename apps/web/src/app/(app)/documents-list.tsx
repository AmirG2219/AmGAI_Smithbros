import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { defaultMessage, DOC_LABEL } from "@/lib/agreements/send";
import { Card, PageHeader, Pill } from "./ui";
import { Pager, pageOf, rangeOf } from "./pager";
import { sendDocumentAction } from "./documents/actions";
import { SendDocument } from "./send-document";

type Contact = { first_name: string; last_name: string | null; email: string | null };

type Row = {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  projects: { contacts: Contact | Contact[] | null } | null;
  agreement_documents: { id: string; document_kind: string }[];
};

const META = {
  work_contract: {
    eyebrow: "Documents",
    title: "Contracts",
    newLabel: "New contract",
    blurb: "The signed flooring contract for a job: scope, price, payment and schedule.",
  },
  policy_liability: {
    eyebrow: "Documents",
    title: "Agreements",
    newLabel: "New agreement",
    blurb: "The policy and liability agreement a client signs before work begins.",
  },
} as const;

export type DocType = keyof typeof META;

const STATUSES = ["generated", "sent", "returned", "verified", "cancelled", "superseded"] as const;

const NOTICES: Record<string, string> = {
  created: "Document created. Review the PDF, then send it to the client.",
  "doc-sent": "Sent to the client with the PDF attached. It is saved on their timeline.",
  "doc-email-off": "Email sending is switched off, so nothing was sent.",
  "doc-skipped": "Not sent: the recipient is not on the demo-mode allowlist.",
  "doc-failed": "The email could not be sent. Nothing was marked as sent. Please try again.",
  "doc-invalid": "That could not be sent. Check the email address, subject and message.",
};

// One section's list: only documents of this type.
export async function DocumentsList({
  type,
  notice,
  q,
  status,
  p,
}: {
  type: DocType;
  notice?: string;
  q?: string;
  status?: string;
  p?: string;
}) {
  const page = pageOf(p);
  const m = META[type];
  const supabase = await createClient();
  const term = (q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const statusFilter = (STATUSES as readonly string[]).includes(status ?? "") ? status : undefined;

  // Name or email search: find the matching clients first, then their projects.
  let projectIds: string[] | null = null;
  if (term) {
    const { data: cs } = await supabase
      .from("contacts")
      .select("id")
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(200);
    const ids = (cs ?? []).map((c) => c.id);
    const { data: ps } = ids.length ? await supabase.from("projects").select("id").in("contact_id", ids).limit(500) : { data: [] };
    projectIds = (ps ?? []).map((p) => p.id);
  }

  let query = supabase
    .from("agreements")
    .select(
      "id, status, created_at, sent_at, projects(contacts(first_name, last_name, email)), agreement_documents(id, document_kind)",
      { count: "exact" },
    )
    .eq("document_type", type);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (projectIds) query = query.in("project_id", projectIds);
  const [from, to] = rangeOf(page);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Documents
      </Link>
      <PageHeader eyebrow={m.eyebrow} title={m.title}>
        <Link
          href={`/documents/new?type=${type}`}
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> {m.newLabel}
        </Link>
      </PageHeader>
      <p className="-mt-3 mb-5 text-sm text-muted">{m.blurb}</p>

      {notice && NOTICES[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{NOTICES[notice]}</p>
      )}

      <form className="mb-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search by client name or email"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze sm:max-w-xs"
        />
        <select name="status" defaultValue={statusFilter ?? ""} className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm capitalize outline-none focus:border-bronze">
          <option value="">Any status</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-walnut px-4 py-2.5 text-sm font-medium hover:bg-walnut hover:text-cream">Search</button>
        {(term || statusFilter) && (
          <Link href={`/${type === "work_contract" ? "contracts" : "agreements"}`} className="self-center text-sm text-bronze hover:text-walnut">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">{term || statusFilter ? "No documents match." : "Nothing here yet."}</Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((a) => {
            const c = Array.isArray(a.projects?.contacts) ? a.projects?.contacts[0] : a.projects?.contacts;
            const pdf = a.agreement_documents.find((d) => d.document_kind === "generated");
            return (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c?.first_name} {c?.last_name}
                  </p>
                  <p className="text-sm text-muted">
                    Created {new Date(a.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                    {a.sent_at && ` · sent ${new Date(a.sent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Pill kind="review">{a.status}</Pill>
                  {["generated", "sent"].includes(a.status) && pdf && c?.email && (
                    <SendDocument
                      action={sendDocumentAction.bind(null, a.id, `/${type === "work_contract" ? "contracts" : "agreements"}`)}
                      defaultTo={c.email}
                      subject={`Your Smith Bros Floors ${DOC_LABEL[type]}`}
                      message={defaultMessage(c.first_name, type)}
                      resend={a.status === "sent"}
                    />
                  )}
                  {pdf && (
                    <a
                      href={`/api/agreements/${pdf.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-4 py-2 text-sm hover:border-bronze"
                    >
                      Open PDF
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pager
        page={page}
        total={count ?? 0}
        hrefFor={(pg) => {
          const qs = new URLSearchParams({ ...(term ? { q: term } : {}), ...(statusFilter ? { status: statusFilter } : {}), ...(pg > 1 ? { p: String(pg) } : {}) }).toString();
          const base = type === "work_contract" ? "/contracts" : "/agreements";
          return qs ? `${base}?${qs}` : base;
        }}
      />
    </div>
  );
}
