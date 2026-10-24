import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Send, Sparkles, X } from "lucide-react";
import { replyAiEnabled } from "@/lib/assistant/draft";
import { gmailSendConfigured } from "@/lib/assistant/send";
import { createClient } from "@/lib/supabase/server";
import { Card, Pill } from "../ui";
import { AutoDraft } from "./auto-draft";
import { approveAndSend, blankReply, rejectDraft, saveDraft, setEmailStatus, writeReply } from "./actions";

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };
const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const lbl = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors";

const notices: Record<string, string> = {
  drafted: "A new draft is ready. Read it and edit anything before you send.",
  saved: "Draft saved.",
  sent: "Reply sent. It is saved in this conversation and on the lead's timeline.",
  queued: "Approved. It will go out as soon as the Gmail connection is set up.",
  rejected: "Draft discarded.",
  demo: "Not sent: demo mode only allows emails to approved test addresses.",
  "send-failed": "The reply could not be sent. Your draft is kept. Try again.",
  "draft-failed": "The assistant couldn't write a draft just now.",
  invalid: "That didn't work. Please try again.",
};

type Msg = { id: string; direction: "inbound" | "outbound"; from_address: string; from_name: string | null; body_text: string; received_at: string };
type Draft = { id: string; status: string; subject: string; body_text: string; checks: string[]; source: string; error_summary: string | null; sent_at: string | null };

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" });
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function MessageCard({ m }: { m: Msg }) {
  const mine = m.direction === "outbound";
  return (
    <div className={`rounded-xl border p-4 ${mine ? "border-bronze/30 bg-cream/70" : "border-line bg-white"}`}>
      <p className="mb-2 text-xs text-muted">
        {mine ? "You replied" : m.from_name || m.from_address} · {when(m.received_at)}
      </p>
      {/* Plain text only: email content is untrusted and never rendered as HTML */}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{m.body_text || "(empty)"}</pre>
    </div>
  );
}

// The email, everything we know about it, and a reply that is already drafted. Shown beside the list.
export async function EmailPanel({ id, back, notice }: { id: string; back: string; notice?: string }) {
  const supabase = await createClient();
  const { data: e } = await supabase.from("inbox_emails").select("*, contacts(id, first_name, last_name)").eq("id", id).maybeSingle();

  if (!e)
    return (
      <Card className="p-8 text-center">
        <p className="font-serif text-xl">That email isn&apos;t available</p>
        <Link href={back} className="mt-4 inline-block text-sm text-bronze underline">
          Back to the inbox
        </Link>
      </Card>
    );

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

  const messages = (thread as Msg[] | null)?.length ? (thread as Msg[]) : [e as Msg];
  const earlier = messages.slice(0, -1);
  const latest = messages[messages.length - 1];
  const all = (drafts ?? []) as Draft[];
  const open = all.find((d) => ["draft", "approved", "failed"].includes(d.status));
  const sent = all.find((d) => d.status === "sent");
  const c = Array.isArray(e.contacts) ? e.contacts[0] : e.contacts;
  const connected = gmailSendConfigured();
  const ai = replyAiEnabled();
  const isInbound = e.direction === "inbound";
  const canAutoDraft = isInbound && e.status === "open" && e.needs_reply !== false && !open && !sent;
  const sender = e.from_name || e.from_address;

  return (
    <div className="grid gap-4">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-walnut font-serif text-lg text-gold">{initials(sender)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{sender}</p>
            <p className="truncate text-xs text-muted">
              {e.from_name ? `${e.from_address} · ` : ""}
              {when(e.received_at)}
            </p>
          </div>
          <Link href={back} aria-label="Close" className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-bronze hover:text-walnut">
            <X size={15} /> <span className="lg:hidden">Back</span>
            <span className="hidden lg:inline">Close</span>
          </Link>
        </div>

        <h2 className="mt-4 font-serif text-2xl leading-tight">{e.subject || "(no subject)"}</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {e.priority && <Pill kind={priorityPill[e.priority]}>{e.priority}</Pill>}
          {e.category && <span className="rounded-full bg-line px-3 py-1 text-xs capitalize">{e.category.replaceAll("_", " ")}</span>}
          {e.needs_reply === false && <span className="rounded-full bg-line px-3 py-1 text-xs">No reply needed</span>}
          {c && (
            <Link href={`/contacts/${c.id}`} className="rounded-full border border-bronze/40 px-3 py-1 text-xs text-bronze hover:bg-bronze hover:text-cream">
              Client: {c.first_name} {c.last_name}
            </Link>
          )}
          {e.project_id && (
            <Link href={`/leads/${e.project_id}`} className="rounded-full border border-bronze/40 px-3 py-1 text-xs text-bronze hover:bg-bronze hover:text-cream">
              Open lead
            </Link>
          )}
        </div>
      </Card>

      {notice && notices[notice] && (
        <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}

      <Card className="border-gold/40 bg-gold/[0.07] p-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-bronze">
          <Sparkles size={14} /> At a glance
        </p>
        {e.summary ? (
          <>
            <p className="text-sm leading-relaxed">{e.summary}</p>
            {e.suggested_action && (
              <p className="mt-2 text-sm">
                <span className="text-muted">Suggested next step: </span>
                {e.suggested_action}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">AI summary. Please check it against the email.</p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {e.analysis_status === "skipped"
              ? "Summaries are off until an OpenAI API key is added."
              : e.analysis_status === "failed"
                ? "A summary couldn't be generated for this email."
                : "Summary is being prepared…"}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <p className="eyebrow mb-3">Conversation</p>
        <div className="grid gap-3">
          {earlier.length > 0 && (
            <details className="group rounded-xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-muted">
                {earlier.length} earlier message{earlier.length === 1 ? "" : "s"}
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-line p-3">
                {earlier.map((m) => (
                  <MessageCard key={m.id} m={m} />
                ))}
              </div>
            </details>
          )}
          <MessageCard m={latest} />
        </div>
      </Card>

      {isInbound && (
        <Card className="border-bronze/40 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Your reply</p>
            {open && (
              <span className="inline-flex items-center gap-1.5 text-xs text-bronze">
                {open.source === "ai" ? <Sparkles size={13} /> : null}
                {open.source === "ai" ? "Drafted for you. Check it and edit anything." : "Draft"}
              </span>
            )}
          </div>

          {open ? (
            <div className="grid gap-4">
              {open.checks.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle size={16} /> Check before you send
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {open.checks.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {open.status === "failed" && open.error_summary && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{open.error_summary}</p>
              )}
              {open.status === "approved" && (
                <p className="rounded-xl border border-line bg-cream/60 px-4 py-3 text-sm">Approved and waiting for the Gmail connection. You can still edit it below.</p>
              )}

              <form className="grid gap-3">
                <div>
                  <label className={lbl} htmlFor="subject">Subject</label>
                  <input id="subject" name="subject" defaultValue={open.subject} className={input} />
                </div>
                <div>
                  <label className={lbl} htmlFor="body">Message</label>
                  <textarea id="body" name="body" rows={11} defaultValue={open.body_text} className={`${input} leading-relaxed`} />
                  <p className="mt-1 text-xs text-muted">Your signature is added automatically.</p>
                </div>
                {!connected && (
                  <p className="text-xs text-bronze">Gmail sending isn&apos;t connected yet, so sending keeps the reply ready without sending it.</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button formAction={approveAndSend.bind(null, id, open.id, back)} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
                    <Send size={15} /> {open.status === "approved" || open.status === "failed" ? "Send now" : "Send reply"}
                  </button>
                  <button formAction={saveDraft.bind(null, id, open.id, back)} className={`${btn} border border-line hover:border-bronze`}>
                    Save draft
                  </button>
                </div>
              </form>

              <div className="grid gap-3 border-t border-line pt-4">
                {ai && (
                  <form action={writeReply.bind(null, id, back)} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <label className={lbl} htmlFor="instruction">Ask for a different version</label>
                      <input id="instruction" name="instruction" placeholder="e.g. Shorter, and offer Thursday at 2pm" className={input} />
                    </div>
                    <button className={`${btn} border border-bronze text-bronze hover:bg-bronze hover:text-cream`}>
                      <Sparkles size={15} /> Rewrite
                    </button>
                  </form>
                )}
                <form action={rejectDraft.bind(null, id, open.id, back)}>
                  <button className="text-sm text-muted underline hover:text-walnut">Discard this draft</button>
                </form>
              </div>
            </div>
          ) : canAutoDraft ? (
            <AutoDraft
              emailId={id}
              writeManually={
                <div className="flex flex-wrap gap-3">
                  <form action={writeReply.bind(null, id, back)}>
                    <button className={`${btn} border border-bronze text-bronze hover:bg-bronze hover:text-cream`}>Try again</button>
                  </form>
                  <form action={blankReply.bind(null, id, back)}>
                    <button className={`${btn} bg-walnut text-cream hover:bg-bronze`}>Write it myself</button>
                  </form>
                </div>
              }
            />
          ) : sent ? (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 text-sm">
                <Check size={16} className="text-bronze" /> Reply sent {sent.sent_at ? when(sent.sent_at) : ""}. It is in the conversation above.
              </p>
              <form action={writeReply.bind(null, id, back)}>
                <button className={`${btn} border border-line hover:border-bronze`}>Write another reply</button>
              </form>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted">
                {e.needs_reply === false ? "This email doesn't look like it needs a reply." : "This email is closed."} You can still write one.
              </p>
              <form action={writeReply.bind(null, id, back)}>
                <button className={`${btn} border border-line hover:border-bronze`}>Write a reply anyway</button>
              </form>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {e.status === "open" ? (
          <>
            <form action={setEmailStatus.bind(null, id, "handled", back)}>
              <button className={`${btn} border border-line hover:border-bronze`}>
                <Check size={15} /> Mark handled
              </button>
            </form>
            <form action={setEmailStatus.bind(null, id, "archived", back)}>
              <button className={`${btn} border border-line hover:border-bronze`}>Archive</button>
            </form>
          </>
        ) : (
          <form action={setEmailStatus.bind(null, id, "open", back)}>
            <button className={`${btn} border border-line hover:border-bronze`}>Reopen</button>
          </form>
        )}
      </div>
    </div>
  );
}
