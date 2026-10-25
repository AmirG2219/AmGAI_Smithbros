import { NextResponse } from "next/server";
import { getMe } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserError } from "@/lib/agreements/build";
import { recordSignedReturn } from "@/lib/agreements/review";

// Receives the returned signed PDF (multipart form, field "file"). It is stored as evidence and the agreement is
// marked "returned"; it is never verified here. A route handler is used because server actions cap bodies at 1 MB.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await getMe();
  if (!me || me.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });

  const back = (q: string) => NextResponse.redirect(new URL(`/agreements/${id}?${q}`, req.url), 303);
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new UserError("Choose a signed PDF to upload.");
    await recordSignedReturn(createAdminClient(), me.id, id, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (!(e instanceof UserError)) console.error("[agreements] signed upload failed:", e);
    return back(`error=${encodeURIComponent(e instanceof UserError ? e.message : "The upload failed. Please try again.")}`);
  }
  return back("notice=signed");
}
