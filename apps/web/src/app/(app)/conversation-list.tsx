import Link from "next/link";
import type { ConversationSummary } from "@/lib/inbox/links";
import { Card } from "./ui";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

// Inbox conversations tied to a client or lead. Each row opens the original conversation in the Inbox.
export function ConversationList({ items, empty }: { items: ConversationSummary[]; empty: string }) {
  return (
    <Card className="p-5">
      <p className="eyebrow mb-3">Inbox conversations</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => (
            <li key={c.key} className="py-2.5 text-sm first:pt-0 last:pb-0">
              <Link href={c.href} className="flex items-center justify-between gap-3 hover:text-bronze">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-xs text-muted">{c.lastDirection === "outbound" ? "We replied" : c.needsAttention ? "Needs reply" : "Received"}</span>
                  {c.subject}
                  {c.messages > 1 && <span className="ml-2 text-xs text-muted">{c.messages} messages</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{day(c.lastAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
