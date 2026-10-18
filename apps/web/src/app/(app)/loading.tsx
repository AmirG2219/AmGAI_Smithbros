// Shown instantly while a page's data loads, so every click feels immediate.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-8">
        <div className="h-3 w-24 rounded bg-line" />
        <div className="mt-3 h-9 w-56 rounded bg-line" />
        <div className="mt-3 h-3 w-40 rounded bg-line/70" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-card" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-line bg-card" />
        ))}
      </div>
    </div>
  );
}
