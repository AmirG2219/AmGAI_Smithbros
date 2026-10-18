import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "./ui";

type Row = {
  id: string;
  status: string;
  created_at: string;
  projects: { contacts: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null } | null;
  agreement_documents: { id: string; document_kind: string }[];
};

const META = {
  work_contract: {
    eyebrow: "Work contracts",
    title: "Contracts",
    newLabel: "New contract",
    blurb: "The signed flooring contract for a job: scope, price, payment and schedule.",
  },
  policy_liability: {
    eyebrow: "Policy & liability",
    title: "Agreements",
    newLabel: "New agreement",
    blurb: "The policy and liability agreement a client signs before work begins.",
  },
} as const;

export type DocType = keyof typeof META;

// One section's list: only documents of this type.
export async function DocumentsList({ type, notice }: { type: DocType; notice?: string }) {
  const m = META[type];
  const supabase = await createClient();
  const { data } = await supabase
    .from("agreements")
    .select(
      "id, status, created_at, projects(contacts(first_name, last_name)), agreement_documents(id, document_kind)",
    )
    .eq("document_type", type)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <PageHeader eyebrow={m.eyebrow} title={m.title}>
        <Link
          href={`/documents/new?type=${type}`}
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> {m.newLabel}
        </Link>
      </PageHeader>
      <p className="-mt-3 mb-5 text-sm text-muted">{m.blurb}</p>

      {notice === "created" && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          Document created. Open the PDF below to review it.
        </p>
      )}

      {rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">Nothing here yet.</Card>
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
                    {new Date(a.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Pill kind="review">{a.status}</Pill>
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
    </div>
  );
}
