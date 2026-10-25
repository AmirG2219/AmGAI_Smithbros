import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Streams a stored agreement PDF to a signed-in admin. [id] is the agreement_documents id. ?download=1 saves it.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // This select runs as the signed-in user: RLS returns the row only to an active admin.
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("agreement_documents")
    .select("storage_path, agreement_id, document_kind, revision_number")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const file = await createAdminClient().storage.from("agreements").download(doc.storage_path);
  if (file.error) return new NextResponse("File unavailable", { status: 502 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = `${doc.document_kind === "signed_return" ? "signed" : "agreement"}-${doc.agreement_id.slice(0, 8)}-r${doc.revision_number}.pdf`;
  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
