import { NextResponse } from "next/server";
import { getMe } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserError } from "@/lib/agreements/build";
import { readAgreementForm, renderPreview } from "@/lib/agreements/prepare";
import type { DocType } from "@/lib/agreements/vars";

// Renders the customer-facing PDF from the Create Agreement form values, in memory. No agreement, quote or file is saved.
export async function POST(req: Request) {
  const me = await getMe(); // runs as the signed-in user; only an active admin comes back
  if (!me || me.role !== "admin") return new NextResponse("Not authorised", { status: 401 });
  const form = await req.formData();
  const type = String(form.get("type") ?? "") as DocType;
  if (type !== "work_contract" && type !== "policy_liability") return new NextResponse("Unknown document", { status: 400 });
  try {
    const pdf = await renderPreview(createAdminClient(), readAgreementForm(form), type);
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="preview.pdf"', "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return new NextResponse(e instanceof UserError ? e.message : "Preview unavailable", { status: 422 });
  }
}
