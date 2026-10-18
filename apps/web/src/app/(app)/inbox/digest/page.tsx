import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { buildDigest } from "@/lib/assistant/digest";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../../ui";
import { emailBriefToMe } from "./actions";

const notices: Record<string, string> = {
  sent: "Sent. Check your inbox.",
  off: "Email sending is off in this environment, so nothing was sent.",
  failed: "The email could not be sent. Please try again.",
};

export default async function DigestPreview({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  // Built as the signed-in owner, so the database only shows what he is allowed to see.
  const d = await buildDigest(await createClient());

  return (
    <div>
      <Link href="/inbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Email Assistant
      </Link>
      <PageHeader eyebrow="Email Assistant" title="Morning brief">
        <form action={emailBriefToMe}>
          <button className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
            <Mail size={16} /> Email it to me now
          </button>
        </form>
      </PageHeader>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-muted">
        This is the summary that arrives in your inbox each morning once the daily schedule is switched on. It is built fresh from your emails, leads and consultations.
      </p>
      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}
      <Card className="max-w-3xl overflow-hidden p-0">
        <p className="border-b border-line bg-card px-5 py-3 text-sm">
          <span className="text-muted">Subject: </span>
          {d.subject}
        </p>
        {/* Sandboxed: the preview can show the email but can never run anything */}
        <iframe title="Morning brief preview" srcDoc={d.html} sandbox="" className="h-[820px] w-full border-0 bg-white" />
      </Card>
    </div>
  );
}
