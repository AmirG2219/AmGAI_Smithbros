import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { emailEnabled } from "@/lib/email/resend";
import { loadLeadForEmail } from "@/lib/leads/email-context";
import { draftEnabled, templateFor, type TemplateKind } from "@/lib/leads/email-draft";
import { newSendKey } from "@/lib/leads/send-key";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../../../ui";
import { draftEmailAction, sendEmailAction } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

const errors: Record<string, string> = {
  missing: "Add a subject and a message.",
  off: "Email sending is turned off in this environment, so nothing was sent. Your text is kept below.",
  "no-email": "This lead has no email address.",
  demo: "Not sent: demo mode only allows emails to approved test addresses. Your text is kept below.",
  failed: "The email could not be sent. Your text is kept below. Please try again.",
  "ai-off": "Claude drafting is off until an Anthropic API key is added.",
  "ai-failed": "Claude couldn't write a draft just now. You can write it yourself.",
};

const templates: { key: TemplateKind; label: string }[] = [
  { key: "blank", label: "Blank" },
  { key: "followup", label: "Follow up on estimate" },
  { key: "book", label: "Invite to book" },
];

export default async function ComposeEmail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; subject?: string; body?: string; error?: string; ai?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lead = await loadLeadForEmail(await createClient(), id);
  if (!lead) notFound();

  const kind = (templates.some((t) => t.key === sp.t) ? sp.t : "blank") as TemplateKind;
  const start = templateFor(kind, lead.ctx);
  // Text carried back from a draft or an error wins over the template.
  const subject = sp.subject ?? start.subject;
  const body = sp.body ?? start.body;

  const draft = draftEmailAction.bind(null, id);
  const send = sendEmailAction.bind(null, id);

  return (
    <div>
      <Link href={`/leads/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Back to lead
      </Link>
      <PageHeader eyebrow="Lead" title={`Email ${lead.ctx.firstName}`} />

      {sp.error && errors[sp.error] && (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errors[sp.error]}</p>
      )}
      {sp.ai && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          Claude wrote this draft. Read it and edit anything before you send.
        </p>
      )}

      <div className="grid max-w-3xl gap-5">
        <Card className="p-5">
          <p className="eyebrow mb-3">Start from</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Link
                key={t.key}
                href={`/leads/${id}/email?t=${t.key}`}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  kind === t.key && !sp.subject && !sp.body
                    ? "border-walnut bg-walnut text-cream"
                    : "border-line bg-card text-muted hover:text-walnut"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {draftEnabled() && (
            <form action={draft} className="mt-5 grid gap-3 border-t border-line pt-5">
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="body" value={body} />
              <div>
                <label className={label} htmlFor="goal">Or let Claude write it</label>
                <input
                  id="goal"
                  name="goal"
                  placeholder="e.g. Ask if they have questions about the estimate and offer a visit"
                  className={input}
                />
              </div>
              <button className="inline-flex w-fit items-center gap-2 rounded-lg border border-bronze px-4 py-2 text-sm text-bronze hover:bg-bronze hover:text-cream">
                <Sparkles size={15} /> Draft with Claude
              </button>
            </form>
          )}
        </Card>

        <form action={send} key={`${kind}|${sp.subject ?? ""}|${sp.body ?? ""}`}>
          <input type="hidden" name="send_key" value={newSendKey()} />
          <Card className="grid gap-4 p-5">
            <div>
              <p className={label}>To</p>
              <p className="text-sm">
                {lead.fullName} <span className="text-muted">&lt;{lead.email ?? "no email address"}&gt;</span>
              </p>
            </div>
            <div>
              <label className={label} htmlFor="subject">Subject</label>
              <input id="subject" name="subject" defaultValue={subject} required className={input} />
            </div>
            <div>
              <label className={label} htmlFor="body">Message</label>
              <textarea id="body" name="body" rows={11} defaultValue={body} required className={input} />
              <p className="mt-1 text-xs text-muted">Your name and &ldquo;Smith Bros Floors&rdquo; are added at the end automatically.</p>
            </div>
            {!emailEnabled() && (
              <p className="text-xs text-bronze">Email sending is off in this environment, so sending won&apos;t go out yet.</p>
            )}
          </Card>
          <button
            disabled={!lead.email}
            className="mt-5 rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze disabled:opacity-50"
          >
            Send email
          </button>
        </form>
      </div>
    </div>
  );
}
