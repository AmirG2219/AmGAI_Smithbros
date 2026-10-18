import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../../ui";
import { addKnowledge, removeKnowledge, saveSignature } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";
const small = "rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream hover:bg-bronze";

const notices: Record<string, string> = {
  added: "Added.",
  removed: "Removed.",
  saved: "Signature saved.",
  missing: "Please fill in the required fields.",
  failed: "That didn't save. Please try again.",
};

type Item = { id: string; kind: string; title: string | null; content: string };

function ItemList({ items, empty }: { items: Item[]; empty: string }) {
  if (items.length === 0) return <p className="mb-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mb-4 divide-y divide-line rounded-xl border border-line bg-white">
      {items.map((i) => (
        <li key={i.id} className="flex items-start justify-between gap-4 p-3 text-sm">
          <div className="min-w-0">
            {i.title && <p className="font-medium">{i.title}</p>}
            <p className="whitespace-pre-wrap text-muted">{i.content}</p>
          </div>
          <form action={removeKnowledge.bind(null, i.id)}>
            <button className="shrink-0 text-xs text-muted underline hover:text-walnut">Remove</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default async function AssistantSettings({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("assistant_knowledge")
    .select("id, kind, title, content")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(300);
  const rows = (data ?? []) as Item[];
  const signature = rows.find((r) => r.kind === "signature");
  const of = (k: string) => rows.filter((r) => r.kind === k);

  return (
    <div>
      <Link href="/inbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Email Assistant
      </Link>
      <PageHeader eyebrow="Email Assistant" title="Teach the assistant" />
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted">
        The assistant writes replies using only what is on this page and what is in your customer records. The more it knows, the less you have to fix.
      </p>
      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}

      <div className="grid max-w-3xl gap-6">
        <Card className="p-5">
          <p className="eyebrow mb-1">Your signature</p>
          <p className="mb-3 text-xs text-muted">Added to the end of every reply you send.</p>
          <form action={saveSignature} className="grid gap-3">
            <textarea name="content" rows={4} defaultValue={signature?.content ?? ""} placeholder={"Paul Smith\nSmith Bros Floors\n403-555-0100"} className={input} />
            <button className={`w-fit ${small}`}>Save signature</button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-1">Standard answers</p>
          <p className="mb-3 text-xs text-muted">Questions customers often ask, and the answer you always give. The assistant never guesses beyond these.</p>
          <ItemList items={of("faq")} empty="No standard answers yet." />
          <form action={addKnowledge.bind(null, "faq")} className="grid gap-3">
            <div>
              <label className={label} htmlFor="faq-q">Question</label>
              <input id="faq-q" name="title" placeholder="How long does a refinish take?" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="faq-a">Your answer</label>
              <textarea id="faq-a" name="content" rows={3} className={input} />
            </div>
            <button className={`w-fit ${small}`}>Add answer</button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-1">Never answer on its own</p>
          <p className="mb-3 text-xs text-muted">Topics the assistant must leave to you. It will write a short holding reply and flag the question for you.</p>
          <ItemList items={of("rule")} empty="No rules yet. Suggestions: exact prices, contract changes, complaints, legal matters." />
          <form action={addKnowledge.bind(null, "rule")} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className={label} htmlFor="rule">Rule</label>
              <input id="rule" name="content" placeholder="Never give an exact price by email" className={input} />
            </div>
            <button className={small}>Add rule</button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-1">Examples of how you write</p>
          <p className="mb-3 text-xs text-muted">Paste a few real replies you have sent (remove customer names if you like). The assistant copies your tone, not the content.</p>
          <ItemList items={of("voice_sample")} empty="No examples yet." />
          <form action={addKnowledge.bind(null, "voice_sample")} className="grid gap-3">
            <textarea name="content" rows={5} placeholder="Paste one of your replies here" className={input} />
            <button className={`w-fit ${small}`}>Add example</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
