import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-card p-8 text-center">
      <h1 className="font-serif text-2xl">We couldn&apos;t find that</h1>
      <p className="mt-2 text-sm text-muted">It may have been moved, or the link is out of date.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
        Go to Dashboard
      </Link>
    </div>
  );
}
