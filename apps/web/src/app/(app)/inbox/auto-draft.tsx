"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ensureDraft } from "./actions";

// Shown in place of the reply box while the first draft is being written. When it is ready the panel refreshes itself.
export function AutoDraft({ emailId, writeManually }: { emailId: string; writeManually: React.ReactNode }) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    ensureDraft(emailId).then((r) => (r.ok ? router.refresh() : setFailed(true)));
  }, [emailId, router]);

  if (failed)
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted">The assistant couldn&apos;t write a draft just now. You can write the reply yourself.</p>
        {writeManually}
      </div>
    );

  return (
    <div className="animate-pulse" role="status" aria-label="Writing a draft reply">
      <p className="mb-3 flex items-center gap-2 text-sm text-bronze">
        <Sparkles size={15} /> Writing a draft reply…
      </p>
      <div className="mb-3 h-10 rounded-lg bg-line/70" />
      <div className="h-44 rounded-lg bg-line/50" />
    </div>
  );
}
