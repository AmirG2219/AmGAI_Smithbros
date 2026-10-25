import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserError, renderDraftPdf } from "@/lib/agreements/build";

// Renders a draft agreement's PDF on the fly from its saved values (nothing is stored). [id] is the agreement id.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: a } = await supabase.from("agreements").select("id").eq("id", id).maybeSingle(); // RLS: active admins only
  if (!a) return new NextResponse("Not found", { status: 404 });
  try {
    const pdf = await renderDraftPdf(createAdminClient(), id);
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="draft-preview.pdf"', "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return new NextResponse(e instanceof UserError ? e.message : "Preview unavailable", { status: 422 });
  }
}
