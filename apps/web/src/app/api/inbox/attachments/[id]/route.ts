import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends a saved email attachment to a signed-in admin. It always downloads and is never opened in the browser,
// because attachments come from outside and could be a web page or script.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const bytes = await file.data.arrayBuffer();

  // Preview (?view=1) is allowed only for pictures and PDFs whose first bytes really are that kind of file.
  // The sender's claimed type is never trusted; anything else downloads.
  if (new URL(req.url).searchParams.get("view") === "1") {
    const head = new Uint8Array(bytes.slice(0, 12));
    const is = (...sig: number[]) => sig.every((b, i) => head[i] === b);
    const kind = is(0x89, 0x50, 0x4e, 0x47)
      ? "image/png"
      : is(0xff, 0xd8, 0xff)
        ? "image/jpeg"
        : is(0x47, 0x49, 0x46, 0x38)
          ? "image/gif"
          : is(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
            ? "image/webp"
            : is(0x25, 0x50, 0x44, 0x46)
              ? "application/pdf"
              : null;
    if (kind)
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": kind,
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": kind === "application/pdf" ? "default-src 'none'" : "default-src 'none'; sandbox",
          "Cache-Control": "private, no-store",
        },
      });
  }

  const safeName = a.filename.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
