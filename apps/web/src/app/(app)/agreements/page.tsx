import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";

type Row = {
  id: string;
  document_type: string;
  status: string;
  created_at: string;
  projects: { contacts: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null } | null;
  agreement_documents: { id: string; document_kind: string }[];
};

const typeLabel: Record<string, string> = {
  work_contract: "Work contract",
  policy_liability: "Policy & liability",
};

export default async function Agreements({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("agreements")
    .select(
      "id, document_type, status, created_at, projects(contacts(first_name, last_name)), agreement_documents(id, document_kind)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <PageHeader eyebrow="System 3" title="Agreements">
        <Link
          href="/agreements/new"
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> New agreement
        </Link>
      </PageHeader>

      {notice === "created" && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          Documents created. Open the PDF below to review it.
        </p>
      )}

      {rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">No agreements yet.</Card>
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
                    {typeLabel[a.document_type] ?? a.document_type} ·{" "}
                    {new Date(a.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
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
