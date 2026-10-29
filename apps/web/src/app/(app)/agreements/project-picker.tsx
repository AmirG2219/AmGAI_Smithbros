"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { FolderOpen, FolderPlus, LoaderCircle, Search } from "lucide-react";
import { pretty } from "@/lib/agreements/status";
import { PROJECT_TYPE_CHOICES } from "@/lib/agreements/vars";
import { createProjectFormAction, type ProjectFormState } from "./actions";
import { Submit, input, labelCls } from "./client";

export type ProjectRow = {
  id: string;
  project_type: string | null;
  project_name: string | null;
  site_address_line1: string | null;
  site_city: string | null;
  stage: string | null;
};

const MIN_CHARS = 2;
export const projectTitle = (p: Pick<ProjectRow, "project_name" | "project_type">) => p.project_name || pretty(p.project_type);

function Existing({ customerId, docs, initial, total }: { customerId: string; docs: string; initial: ProjectRow[]; total: number }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const term = q.trim();
  const searching = term.length >= MIN_CHARS;

  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/agreements/projects?customer=${customerId}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setFound((await res.json()).projects ?? []);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, customerId]);

  const rows = searching && status === "done" ? found : initial;
  const hrefFor = (id: string) => `/agreements/new?customer=${customerId}&project=${id}${docs ? `&docs=${docs}` : ""}`;
  const loading = searching && status === "loading";

  return (
    <div className="grid gap-3">
      {total > initial.length && (
        <div>
          <label htmlFor="project-search" className={labelCls}>Search this customer&apos;s projects</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="project-search"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Address, city, type or name"
              className={`${input} pl-9 pr-9`}
            />
            {loading && <LoaderCircle size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
          </div>
          <p className={`mt-1.5 text-xs ${status === "error" && searching ? "text-red-700" : "text-muted"}`} role="status" aria-live="polite">
            {!searching
              ? `Showing the ${initial.length} most recent of ${total}. Type to search the rest.`
              : loading
                ? "Searching…"
                : status === "error"
                  ? "Search is unavailable right now. Try again."
                  : rows.length === 0
                    ? "No project matches. Check the spelling, or create a new project."
                    : `${rows.length} match${rows.length === 1 ? "" : "es"}`}
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link href={hrefFor(p.id)} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-sm hover:bg-cream/70">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{projectTitle(p)}</span>
                  <span className="block truncate text-xs text-muted">
                    {[p.project_name ? pretty(p.project_type) : null, [p.site_address_line1, p.site_city].filter(Boolean).join(", ") || "No address yet"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{pretty(p.stage)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewProject({ customerId, docs }: { customerId: string; docs: string }) {
  const [state, action] = useActionState<ProjectFormState, FormData>(createProjectFormAction.bind(null, customerId), null);
  const [v, setV] = useState({ project_name: "", project_type: "", site_address_line1: "", site_city: "", site_postal_code: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="docs" value={docs} />
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="project_name">Project name <span className="normal-case tracking-normal">(optional)</span></label>
        <input id="project_name" name="project_name" maxLength={120} value={v.project_name} onChange={set("project_name")} placeholder="e.g. Main floor and stairs" className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="project_type">Project type</label>
        <select id="project_type" name="project_type" required value={v.project_type} onChange={set("project_type")} className={input}>
          <option value="" disabled>Choose…</option>
          {PROJECT_TYPE_CHOICES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">A general category for the job. The rooms and flooring services are added later, in Scope of Work.</p>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="site_address_line1">Job site street address</label>
        <input id="site_address_line1" name="site_address_line1" required value={v.site_address_line1} onChange={set("site_address_line1")} className={input} />
      </div>
      <div>
        <label className={labelCls} htmlFor="site_city">City</label>
        <input id="site_city" name="site_city" value={v.site_city} onChange={set("site_city")} className={input} />
      </div>
      <div>
        <label className={labelCls} htmlFor="site_postal_code">Postal code</label>
        <input id="site_postal_code" name="site_postal_code" value={v.site_postal_code} onChange={set("site_postal_code")} className={input} />
      </div>
      {state?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit pending="Creating…">Create project and continue</Submit>
        <span className="text-xs text-muted">No website inquiry needed.</span>
      </div>
    </form>
  );
}

const OPTIONS = [
  { key: "existing", label: "Existing project", short: "Existing", Icon: FolderOpen },
  { key: "new", label: "New project", short: "New", Icon: FolderPlus },
] as const;

// Step 2 while no project is chosen: one of this customer's projects, or a new one. Choosing continues via ?project=<id>.
export function ProjectStep({ customerId, docs, initial, total }: { customerId: string; docs: string; initial: ProjectRow[]; total: number }) {
  const [mode, setMode] = useState<"existing" | "new">(total > 0 ? "existing" : "new");
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Project type" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-cream/50 p-1">
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
          total > 0 ? (
            <Existing customerId={customerId} docs={docs} initial={initial} total={total} />
          ) : (
            <p className="text-sm text-muted">This customer has no projects yet. Use New project to create the first one.</p>
          )
        ) : (
          <NewProject customerId={customerId} docs={docs} />
        )}
      </div>
    </div>
  );
}
