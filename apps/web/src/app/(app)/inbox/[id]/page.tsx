import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../../ui";
import { setEmailStatus } from "../actions";

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };
const btn = "rounded-lg px-5 py-2.5 text-sm font-medium";

export default async function EmailDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("inbox_emails")
    .select("*, contacts(first_name, last_name)")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const c = Array.isArray(e.contacts) ? e.contacts[0] : e.contacts;
  const when = new Date(e.received_at).toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div>
      <Link href="/inbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Email Assistant
      </Link>
      <PageHeader eyebrow={`From ${e.from_name || e.from_address}`} title={e.subject || "(no subject)"}>
        {e.priority && <Pill kind={priorityPill[e.priority]}>{e.priority}</Pill>}
      </PageHeader>

      <div className="grid max-w-3xl gap-5">
        <Card className="border-bronze/40 p-5">
          <p className="eyebrow mb-2">Summary</p>
          {e.summary ? (
            <>
              <p className="text-sm">{e.summary}</p>
              {e.suggested_action && (
                <p className="mt-3 text-sm">
                  <span className="text-muted">Suggested: </span>
                  {e.suggested_action}
                </p>
              )}
              <p className="mt-3 text-xs capitalize text-muted">
                {e.category?.replaceAll("_", " ")}
                {e.needs_reply ? " · needs reply" : " · no reply needed"} · AI summary, please verify
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              {e.analysis_status === "skipped"
                ? "AI summaries are off until an Anthropic API key is added."
                : e.analysis_status === "failed"
                  ? "The summary could not be generated for this email."
                  : "Summary is being prepared…"}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-2">Sender</p>
          <p className="text-sm">
            {e.from_name ? `${e.from_name} · ` : ""}
            {e.from_address} · {when}
          </p>
          {c && (
            <p className="mt-2 text-sm">
              Known contact: {c.first_name} {c.last_name}
              {e.project_id && (
                <>
                  {" · "}
                  <Link href={`/leads/${e.project_id}`} className="text-bronze underline">
                    open their lead
                  </Link>
                </>
              )}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-2">Email</p>
          {/* Plain text only: email content is untrusted and never rendered as HTML */}
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{e.body_text || "(empty)"}</pre>
        </Card>

        <div className="flex flex-wrap gap-3">
          {e.status === "open" ? (
            <>
              <form action={setEmailStatus.bind(null, id, "handled")}>
                <button className={`${btn} bg-walnut text-cream hover:bg-bronze`}>Mark handled</button>
              </form>
              <form action={setEmailStatus.bind(null, id, "archived")}>
                <button className={`${btn} border border-line hover:border-bronze`}>Archive</button>
              </form>
            </>
          ) : (
            <form action={setEmailStatus.bind(null, id, "open")}>
              <button className={`${btn} border border-line hover:border-bronze`}>Reopen</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
