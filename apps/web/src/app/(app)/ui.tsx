import type { ReactNode } from "react";

const TZ = "America/Edmonton";

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {new Date().toLocaleDateString("en-CA", {
            timeZone: TZ,
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
      {children}
    </header>
  );
}

export function greeting(name: string) {
  const hour = Number(
    new Date().toLocaleString("en-CA", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }),
  );
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(33,26,22,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

const pillStyle: Record<string, string> = {
  hot: "bg-red-50 text-red-700",
  warm: "bg-amber-50 text-amber-700",
  cold: "bg-stone-100 text-stone-600",
  review: "bg-gold/15 text-bronze",
};

export function Pill({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${pillStyle[kind] ?? "bg-line text-walnut"}`}
    >
      {children}
    </span>
  );
}

export const th = "px-6 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted";
export const td = "px-6 py-4";
