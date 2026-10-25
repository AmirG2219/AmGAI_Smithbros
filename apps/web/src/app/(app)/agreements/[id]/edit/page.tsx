import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadContext } from "@/lib/agreements/build";
import { inputsOf, type DocType, type Snapshot } from "@/lib/agreements/vars";
import { Card, PageHeader } from "../../../ui";
import { updateDraftAction } from "../../actions";
import { Submit } from "../../client";
import { DraftFields } from "../../draft-fields";

export default async function EditDraft({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const { data: a } = await supabase.from("agreements").select("id, project_id, document_type, status, rendered_data_snapshot").eq("id", id).maybeSingle();
  if (!a) notFound();
  if (a.status !== "draft") redirect(`/agreements/${id}`);

  const ctx = await loadContext(createAdminClient(), a.project_id);
  const snap = a.rendered_data_snapshot as Snapshot;
  const saved = inputsOf(snap);
  // A new draft starts with the customer's known details wherever nothing has been entered yet.
  const values = { ...saved, site_address: saved.site_address || ctx.defaults.site_address, client_email: saved.client_email || ctx.defaults.client_email, client_phone: saved.client_phone || ctx.defaults.client_phone };

  return (
    <div>
      <Link href={`/agreements/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Back to preview
      </Link>
      <PageHeader eyebrow="Agreements" title="Edit draft" />
      {notice === "revision" && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          Revision {snap._revision} started. The earlier version and its PDFs are kept unchanged. Review the details, then generate the new PDF.
        </p>
      )}
      {error && <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <form action={updateDraftAction.bind(null, id)} className="grid max-w-3xl gap-5">
        <DraftFields types={[a.document_type as DocType]} clientName={ctx.clientName} quote={ctx.quote} values={values} />
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Submit pending="Saving…">Save and preview</Submit>
          <Link href={`/agreements/${id}`} className="text-sm text-muted hover:text-walnut">Cancel</Link>
        </Card>
      </form>
    </div>
  );
}
