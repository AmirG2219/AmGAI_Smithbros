"use client";

import Link from "next/link";

// If a page fails to load (database hiccup, slow network), show a calm message with a way forward, not a crash screen.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-card p-8 text-center">
      <h1 className="font-serif text-2xl">That page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">
        This is usually a brief connection problem. Nothing was lost. Try again, and if it keeps happening, use Help to reach us.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-bronze">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
