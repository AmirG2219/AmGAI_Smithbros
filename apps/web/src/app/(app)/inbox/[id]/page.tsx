import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Sparkles } from "lucide-react";
import { replyAiEnabled } from "@/lib/assistant/draft";
import { gmailSendConfigured } from "@/lib/assistant/send";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../../ui";
import { setEmailStatus } from "../actions";
import { approveAndSend, rejectDraft, rewriteDraft, saveDraft, writeReply } from "./actions";

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };
const btn = "rounded-lg px-5 py-2.5 text-sm font-medium";
const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";

const notices: Record<string, string> = {
  drafted: "Draft ready. Read it and edit anything before you approve.",
  saved: "Draft saved.",
  sent: "Reply sent. It is saved in this thread and on the lead's timeline.",
  queued: "Approved. It will go out as soon as the Gmail connection is set up.",
  rejected: "Draft discarded.",
  demo: "Not sent: demo mode only allows emails to approved test addresses.",
  "send-failed": "The reply could not be sent. Your draft is kept. See the message below and try again.",
  "draft-failed": "The assistant couldn't write a draft just now. You can write one yourself.",
  invalid: "That didn't work. Please try again.",
};

type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  body_text: string;
  received_at: string;
};
type Draft = {
  id: string;
  status: string;
  subject: string;
  body_text: string;
  checks: string[];
  source: string;
  error_summary: string | null;
  sent_at: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });

export default async function EmailDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();

  const { data: e } = await supabase.from("inbox_emails").select("*, contacts(first_name, last_name)").eq("id", id).maybeSingle();
  if (!e) notFound();

  const [{ data: thread }, { data: drafts }] = await Promise.all([
    e.provider_thread_id
      ? supabase
          .from("inbox_emails")
          .select("id, direction, from_address, from_name, body_text, received_at")
          .eq("provider_thread_id", e.provider_thread_id)
          .order("received_at", { ascending: true })
          .limit(30)
      : Promise.resolve({ data: null }),
    supabase
      .from("email_drafts")
      .select("id, status, subject, body_text, checks, source, error_summary, sent_at")
      .eq("email_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const messages = ((thread as Msg[] | null)?.length ? (thread as Msg[]) : [e as Msg]).slice();
  const all = (drafts ?? []) as Draft[];
  const open = all.find((d) => ["draft", "approved", "failed"].includes(d.status));
  const sent = all.find((d) => d.status === "sent");
  const c = Array.isArray(e.contacts) ? e.contacts[0] : e.contacts;
  const ai = replyAiEnabled();
  const connected = gmailSendConfigured();
  const isInbound = e.direction === "inbound";

  const write = writeReply.bind(null, id);

  return (
    <div>
      <Link href="/inbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Email Assistant
      </Link>
      <PageHeader eyebrow={`From ${e.from_name || e.from_address}`} title={e.subject || "(no subject)"}>
        {e.priority && <Pill kind={priorityPill[e.priority]}>{e.priority}</Pill>}
      </PageHeader>

      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}

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
          {c && (
            <p className="mt-3 text-sm">
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

        <div className="grid gap-3">
          <p className="eyebrow">Conversation</p>
          {messages.map((m) => (
            <Card key={m.id} className={`p-4 ${m.direction === "outbound" ? "border-bronze/40 bg-cream/60" : ""}`}>
              <p className="mb-2 text-xs text-muted">
                {m.direction === "outbound" ? "You replied" : (m.from_name ? `${m.from_name} · ` : "") + m.from_address} · {when(m.received_at)}
              </p>
              {/* Plain text only: email content is untrusted and never rendered as HTML */}
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.body_text || "(empty)"}</pre>
            </Card>
          ))}
        </div>

        {isInbound && (
          <Card className="p-5">
            <p className="eyebrow mb-3">Reply</p>

            {open ? (
              <div className="grid gap-4">
                {open.checks.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="mb-2 flex items-center gap-2 font-medium">
                      <AlertTriangle size={16} /> Check before you send
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      {open.checks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {open.status === "failed" && open.error_summary && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{open.error_summary}</p>
                )}
                {open.status === "approved" && (
                  <p className="rounded-xl border border-line bg-cream/60 px-4 py-3 text-sm">
                    Approved and waiting for the Gmail connection. You can still edit it below.
                  </p>
                )}

                <form className="grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted" htmlFor="subject">Subject</label>
                    <input id="subject" name="subject" defaultValue={open.subject} className={input} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted" htmlFor="body">Message</label>
                    <textarea id="body" name="body" rows={12} defaultValue={open.body_text} className={input} />
                    <p className="mt-1 text-xs text-muted">Your signature is added automatically.</p>
                  </div>
                  {!connected && (
                    <p className="text-xs text-bronze">Gmail sending isn&apos;t connected yet, so approving will keep the reply ready without sending it.</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button formAction={approveAndSend.bind(null, id, open.id)} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
                      {open.status === "approved" || open.status === "failed" ? "Send now" : "Approve and send"}
                    </button>
                    <button formAction={saveDraft.bind(null, id, open.id)} className={`${btn} border border-line hover:border-bronze`}>
                      Save draft
                    </button>
                  </div>
                </form>

                <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  {ai && (
                    <form action={rewriteDraft.bind(null, id, open.id)} className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted" htmlFor="instruction">Ask for a different version</label>
                        <input id="instruction" name="instruction" placeholder="e.g. Shorter, and offer Thursday at 2pm" className={input} />
                      </div>
                      <button className="inline-flex items-center gap-2 rounded-lg border border-bronze px-4 py-2.5 text-sm text-bronze hover:bg-bronze hover:text-cream">
                        <Sparkles size={15} /> Rewrite
                      </button>
                    </form>
                  )}
                  <form action={rejectDraft.bind(null, id, open.id)}>
                    <button className="text-sm text-muted underline hover:text-walnut">Discard this draft</button>
                  </form>
                </div>
              </div>
            ) : sent ? (
              <div>
                <p className="mb-2 text-sm text-muted">Reply sent {sent.sent_at ? when(sent.sent_at) : ""}. It is shown in the conversation above.</p>
              </div>
            ) : (
              <form action={write} className="grid gap-3">
                <p className="text-sm text-muted">
                  {ai
                    ? "The assistant writes a draft using what we know about this customer and your standard answers. You approve it before anything is sent."
                    : "Write a reply here. (AI drafting turns on once an Anthropic API key is added.) Nothing is sent until you approve it."}
                </p>
                {ai && (
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted" htmlFor="instruction">What should the reply do? (optional)</label>
                    <input id="instruction" name="instruction" placeholder="e.g. Offer a visit on Thursday afternoon" className={input} />
                  </div>
                )}
                <button className={`w-fit ${btn} bg-walnut text-cream hover:bg-bronze`}>{ai ? "Draft a reply" : "Start a reply"}</button>
              </form>
            )}
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          {e.status === "open" ? (
            <>
              <form action={setEmailStatus.bind(null, id, "handled")}>
                <button className={`${btn} border border-line hover:border-bronze`}>Mark handled</button>
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
