import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends a saved email attachment to a signed-in admin. It always downloads and is never opened in the browser,
// because attachments come from outside and could be a web page or script.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  // Runs as the signed-in user: row security returns the record only to an active admin.
  const { data: a } = await (await createClient())
    .from("inbox_attachments")
    .select("filename, content_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!a || !a.storage_path) return new NextResponse("Not found", { status: 404 });

  const file = await createAdminClient().storage.from("inbox-attachments").download(a.storage_path);
  if (file.error) return new NextResponse("File unavailable", { status: 502 });

  const safeName = a.filename.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
