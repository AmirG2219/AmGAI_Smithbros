"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, UserPlus, UserRound } from "lucide-react";
import { AddCustomer } from "./add-customer";
import { input } from "./client";

type Customer = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null };
const nameOf = (c: Customer) => [c.first_name, c.last_name].filter(Boolean).join(" ");
const MIN_CHARS = 2;

function Existing() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<string | null>(null);
  const term = q.trim();
  const ready = term.length >= MIN_CHARS;

  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/agreements/customers?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()).customers ?? []);
        setActive(-1);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  const choose = (c: Customer) => {
    setPicked(c.id);
    router.push(`/agreements/new?customer=${c.id}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(results[active]);
    }
  };

  const loading = ready && status === "loading";
  const empty = ready && status === "done" && results.length === 0;
  const failed = ready && status === "error";
  const hint = !ready
    ? `Type at least ${MIN_CHARS} characters to search.`
    : loading
      ? "Searching…"
      : failed
        ? "Search is unavailable right now. Try again, or add the customer as new."
        : empty
          ? "No customer matches. Check the spelling, or add them as a new customer."
          : status === "done"
            ? `${results.length} match${results.length === 1 ? "" : "es"}. Use the arrow keys and Enter, or click one.`
            : "";

  return (
    <div className="relative">
      <label htmlFor="customer-search" className="mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted">Find a customer</label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="customer-search"
          role="combobox"
          aria-expanded={open && ready && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder="Start typing a name, email or phone"
          className={`${input} pl-9 pr-9`}
        />
        {loading && <LoaderCircle size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
      </div>
      <p className={`mt-1.5 text-xs ${failed ? "text-red-700" : "text-muted"}`} role="status" aria-live="polite">{hint}</p>

      {open && ready && results.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Matching customers" className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-surface shadow-lg" style={{ top: "4.1rem" }}>
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 border-b border-line px-3.5 py-2.5 text-sm last:border-0 ${i === active ? "bg-cream/80" : ""} ${picked === c.id ? "opacity-60" : ""}`}
            >
              <UserRound size={16} className="shrink-0 text-bronze" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{nameOf(c)}</span>
                <span className="block truncate text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const OPTIONS = [
  { key: "existing", label: "Existing customer", short: "Existing", Icon: UserRound },
  { key: "new", label: "New customer", short: "New", Icon: UserPlus },
] as const;

// Step 1 while no customer is chosen: Existing or New. Choosing a customer continues via ?customer=<id>.
export function CustomerStep({ startNew = false }: { startNew?: boolean }) {
  const [mode, setMode] = useState<"existing" | "new">(startNew ? "new" : "existing");
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Customer type" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-cream/50 p-1">
        {OPTIONS.map(({ key, label, short, Icon }) => (
          <button
            key={key}
            ref={(el) => {
              tabs.current[key] = el;
            }}
            role="tab"
            type="button"
            aria-selected={mode === key}
            aria-label={label}
            tabIndex={mode === key ? 0 : -1}
            onClick={() => setMode(key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const next = key === "existing" ? "new" : "existing";
              setMode(next);
              tabs.current[next]?.focus();
            }}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${mode === key ? "bg-walnut text-cream shadow-sm" : "text-muted hover:text-walnut"}`}
          >
            <Icon size={16} />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {mode === "existing" ? (
          <Existing />
        ) : (
          <div className="-mt-3">
            <AddCustomer />
          </div>
        )}
      </div>
    </div>
  );
}
