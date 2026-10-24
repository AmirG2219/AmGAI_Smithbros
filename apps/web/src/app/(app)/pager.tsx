import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 25;

// Reads ?p= safely: a whole number, 1 or more.
export const pageOf = (p: string | undefined) => {
  const n = Number.parseInt(p ?? "1", 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : 1;
};

// The row range for a page, for Supabase's .range().
export const rangeOf = (page: number, size = PAGE_SIZE) => [(page - 1) * size, page * size - 1] as const;

// "Showing 26 to 50 of 312" with Previous and Next. Lists never load more than one page of rows, however big the data grows.
export function Pager({
  page,
  total,
  hrefFor,
  size = PAGE_SIZE,
}: {
  page: number;
  total: number;
  hrefFor: (page: number) => string;
  size?: number;
}) {
  if (total <= size) return null;
  const pages = Math.ceil(total / size);
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const btn = "inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm";
  return (
    <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Pages">
      <p className="text-muted">
        {from} to {to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={`${btn} hover:border-bronze`}>
            <ChevronLeft size={15} /> Previous
          </Link>
        ) : (
          <span className={`${btn} text-muted/50`}>
            <ChevronLeft size={15} /> Previous
          </span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={`${btn} hover:border-bronze`}>
            Next <ChevronRight size={15} />
          </Link>
        ) : (
          <span className={`${btn} text-muted/50`}>
            Next <ChevronRight size={15} />
          </span>
        )}
      </div>
    </nav>
  );
}
