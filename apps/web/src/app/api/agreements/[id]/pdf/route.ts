import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Streams a stored agreement PDF to a signed-in admin. [id] is the agreement_documents id.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // This select runs as the signed-in user: RLS returns the row only to an active admin.
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("agreement_documents")
    .select("storage_path, agreement_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const file = await createAdminClient().storage.from("agreements").download(doc.storage_path);
  if (file.error) return new NextResponse("File unavailable", { status: 502 });

  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="agreement-${doc.agreement_id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
