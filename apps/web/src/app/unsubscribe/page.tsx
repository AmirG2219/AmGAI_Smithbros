type SP = { r?: string; t?: string; done?: string; error?: string };

// Public page. Shows a confirm button rather than unsubscribing on load, so link scanners can't do it by accident.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<SP> }) {
  const { r, t, done, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-walnut px-4">
      <div className="w-full max-w-md rounded-2xl bg-cream p-8 text-center">
        <p className="eyebrow text-bronze">Smith Bros Floors</p>
        {done ? (
          <>
            <h1 className="mt-1 font-serif text-4xl">You&apos;re unsubscribed</h1>
            <p className="mt-3 text-sm text-muted">You won&apos;t receive marketing emails from us any more.</p>
          </>
        ) : error || !r || !t ? (
          <>
            <h1 className="mt-1 font-serif text-4xl">Link not valid</h1>
            <p className="mt-3 text-sm text-muted">This unsubscribe link is invalid or has expired. Please reply to the email and we&apos;ll remove you.</p>
          </>
        ) : (
          <form action="/api/unsubscribe" method="post">
            <h1 className="mt-1 font-serif text-4xl">Unsubscribe</h1>
            <p className="mt-3 text-sm text-muted">Stop receiving marketing emails from Smith Bros Floors?</p>
            <input type="hidden" name="r" value={r} />
            <input type="hidden" name="t" value={t} />
            <button className="mt-6 w-full rounded-lg bg-walnut py-3 font-medium text-cream hover:bg-bronze">
              Yes, unsubscribe me
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
