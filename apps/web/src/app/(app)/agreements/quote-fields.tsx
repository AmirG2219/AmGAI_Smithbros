"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Card } from "../ui";
import { input, labelCls } from "./client";
import {
  SCOPE_MAX,
  SCOPE_UNITS,
  cents,
  formatScope,
  money,
  scopeProblem,
  type ScopeArea,
  type ScopeService,
} from "@/lib/agreements/vars";

const newService = (): ScopeService => ({ description: "", quantity: "", unit: "sqft", materials: "", notes: "" });
const newArea = (): ScopeArea => ({ name: "", services: [newService()] });

type Draft = {
  mode: "rooms" | "written";
  areas: ScopeArea[];
  notes: string;
  written: string;
  exclusions: string;
  subtotal: string;
  rate: string;
};
const START: Draft = { mode: "rooms", areas: [newArea()], notes: "", written: "", exclusions: "", subtotal: "", rate: "" };

const AREA_IDEAS = ["Living Room", "Dining Room", "Kitchen", "Bedroom", "Hallway", "Basement", "Staircase", "Entire main floor"];
const SERVICE_IDEAS = [
  "Hardwood installation",
  "Sanding and refinishing",
  "Flooring repairs",
  "Restoration",
  "Stair refinishing",
  "Removal of existing flooring",
];

const small = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:border-bronze";

// Shown only when a work contract has no accepted final quote yet. Staff type in what was agreed with the customer;
// nothing is pre-filled or priced here, and the quote is only recorded as accepted if the confirmation box is ticked.
// The scope is written out as plain text into the quote's scope field, which is what the contract prints.
export function QuoteFields({ saveKey = "" }: { saveKey?: string }) {
  const [d, setD] = useState<Draft>(START);
  const [loaded, setLoaded] = useState(false);
  const storeKey = `agreement-scope:${saveKey}`;
  const scopeBox = useRef<HTMLTextAreaElement>(null);

  // Keep what was typed if the page reloads, or staff go back a step and return. Browser storage is only a convenience.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = saveKey ? sessionStorage.getItem(storeKey) : null;
        if (raw) setD({ ...START, ...JSON.parse(raw) });
      } catch {}
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [storeKey, saveKey]);
  useEffect(() => {
    if (!loaded || !saveKey) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(d));
    } catch {}
  }, [d, loaded, storeKey, saveKey]);

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setArea = (i: number, a: Partial<ScopeArea>) => patch({ areas: d.areas.map((x, k) => (k === i ? { ...x, ...a } : x)) });
  const setService = (i: number, j: number, s: Partial<ScopeService>) =>
    setArea(i, { services: d.areas[i].services.map((x, k) => (k === j ? { ...x, ...s } : x)) });

  const rooms = d.mode === "rooms";
  const scopeText = rooms ? formatScope(d.areas, d.notes) : d.written.trim();
  const problem = rooms ? scopeProblem(d.areas) : d.written.trim() ? null : "Describe the agreed scope of work.";
  const tooLong = scopeText.length > SCOPE_MAX;
  const message = tooLong ? `The scope is ${scopeText.length - SCOPE_MAX} characters too long. Shorten the notes or split the work.` : problem;
  useEffect(() => scopeBox.current?.setCustomValidity(message ?? ""), [message]);

  const s = Number(d.subtotal);
  const r = Number(d.rate);
  const ready = d.subtotal !== "" && d.rate !== "" && Number.isFinite(s) && Number.isFinite(r) && s > 0 && r >= 0;
  const tax = ready ? cents((cents(s) * r) / 100) : 0;

  return (
    <Card className="border-bronze/40 p-4 sm:p-5">
      <p className="eyebrow mb-1">Agreed scope and price</p>
      <p className="mb-4 text-sm text-muted">
        This project has no accepted final quote yet. Record the work and price you agreed with the customer; it is saved as the accepted final quote the contract is built from.
      </p>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={labelCls + " mb-0"}>Scope of work</p>
        <div role="group" aria-label="How to describe the work" className="inline-flex rounded-lg border border-line bg-cream/50 p-0.5 text-xs font-medium">
          {(["rooms", "written"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={d.mode === m}
              onClick={() => patch({ mode: m })}
              className={`rounded-md px-3 py-1.5 transition-colors ${d.mode === m ? "bg-walnut text-cream" : "text-muted hover:text-walnut"}`}
            >
              {m === "rooms" ? "By area" : "Written scope"}
            </button>
          ))}
        </div>
      </div>

      {rooms ? (
        <div className="grid gap-3">
          {d.areas.map((a, i) => (
            <fieldset key={i} className="rounded-xl border border-line bg-surface p-3.5">
              <legend className="sr-only">Area {i + 1}</legend>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className={labelCls} htmlFor={`area-${i}`}>Area or room</label>
                  <input
                    id={`area-${i}`}
                    list="area-ideas"
                    value={a.name}
                    onChange={(e) => setArea(i, { name: e.target.value })}
                    required={d.areas.length > 1}
                    maxLength={80}
                    placeholder="e.g. Living Room (or leave blank for the whole job)"
                    className={input}
                  />
                </div>
                {d.areas.length > 1 && (
                  <button type="button" onClick={() => patch({ areas: d.areas.filter((_, k) => k !== i) })} aria-label={`Remove area ${a.name || i + 1}`} className="mb-0.5 rounded-lg p-2 text-muted hover:bg-cream hover:text-walnut">
                    <X size={16} />
                  </button>
                )}
              </div>

              <ul className="mt-3 grid gap-2.5">
                {a.services.map((sv, j) => (
                  <li key={j} className="rounded-lg border border-line bg-cream/40 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className={labelCls} htmlFor={`svc-${i}-${j}`}>Service</label>
                        <input
                          id={`svc-${i}-${j}`}
                          list="service-ideas"
                          value={sv.description}
                          onChange={(e) => setService(i, j, { description: e.target.value })}
                          required
                          maxLength={160}
                          placeholder="What is being done"
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={`qty-${i}-${j}`}>Quantity</label>
                        <input
                          id={`qty-${i}-${j}`}
                          inputMode="decimal"
                          value={sv.unit === "fixed" ? "" : sv.quantity}
                          disabled={sv.unit === "fixed"}
                          onChange={(e) => setService(i, j, { quantity: e.target.value })}
                          placeholder={sv.unit === "fixed" ? "None" : "Optional"}
                          className={`${input} disabled:opacity-50`}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={`unit-${i}-${j}`}>Unit</label>
                        <select id={`unit-${i}-${j}`} value={sv.unit} onChange={(e) => setService(i, j, { unit: e.target.value as ScopeService["unit"], quantity: e.target.value === "fixed" ? "" : sv.quantity })} className={input}>
                          {SCOPE_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <details className="group mt-2" open={!!(sv.materials || sv.notes)}>
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-bronze [&::-webkit-details-marker]:hidden">
                        <ChevronDown size={14} className="transition-transform group-open:rotate-180" /> Materials, finish and notes (optional)
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelCls} htmlFor={`mat-${i}-${j}`}>Materials and finish</label>
                          <input id={`mat-${i}-${j}`} value={sv.materials} onChange={(e) => setService(i, j, { materials: e.target.value })} maxLength={200} placeholder="e.g. White oak, matte" className={input} />
                        </div>
                        <div>
                          <label className={labelCls} htmlFor={`note-${i}-${j}`}>Work notes</label>
                          <input id={`note-${i}-${j}`} value={sv.notes} onChange={(e) => setService(i, j, { notes: e.target.value })} maxLength={200} className={input} />
                        </div>
                      </div>
                    </details>
                    {a.services.length > 1 && (
                      <button type="button" onClick={() => setArea(i, { services: a.services.filter((_, k) => k !== j) })} className="mt-2 text-xs text-muted hover:text-walnut">
                        Remove this service
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setArea(i, { services: [...a.services, newService()] })} className={`${small} mt-2.5 inline-flex items-center gap-1`}>
                <Plus size={13} /> Add a service
              </button>
            </fieldset>
          ))}
          <button type="button" onClick={() => patch({ areas: [...d.areas, newArea()] })} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-bronze px-3.5 py-2 text-sm font-medium text-bronze hover:bg-bronze/10">
            <Plus size={15} /> Add another area
          </button>
          <datalist id="area-ideas">{AREA_IDEAS.map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="service-ideas">{SERVICE_IDEAS.map((x) => <option key={x} value={x} />)}</datalist>

          <div>
            <label className={labelCls} htmlFor="scope-notes">Additional project notes (optional)</label>
            <textarea id="scope-notes" rows={2} value={d.notes} onChange={(e) => patch({ notes: e.target.value })} className={input} placeholder="Anything else that is part of the agreed work" />
          </div>
        </div>
      ) : (
        <div>
          <label className="sr-only" htmlFor="written-scope">Written scope of work</label>
          <textarea id="written-scope" rows={5} value={d.written} onChange={(e) => patch({ written: e.target.value })} className={input} placeholder="Describe the agreed work in plain words, for a simple job" />
        </div>
      )}

      {/* What the contract is built from: one text value, validated here so problems show before saving. */}
      <textarea ref={scopeBox} name="q_scope" value={scopeText} onChange={() => {}} required tabIndex={-1} aria-hidden className="sr-only" />
      <p className={`mt-2 text-xs ${message ? "text-red-700" : "text-muted"}`} role="status" aria-live="polite">
        {message ?? `${scopeText.length} of ${SCOPE_MAX} characters used.`}
      </p>
      {scopeText && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-bronze">Preview wording in the contract</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-cream px-3 py-2 font-sans text-xs">{scopeText}</pre>
        </details>
      )}

      <div className="mt-4">
        <label className={labelCls} htmlFor="q_exclusions">Excluded work (optional)</label>
        <textarea id="q_exclusions" name="q_exclusions" rows={2} value={d.exclusions} onChange={(e) => patch({ exclusions: e.target.value })} className={input} placeholder="Anything that is not included, e.g. moving furniture" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="q_subtotal">Agreed price before tax (CAD)</label>
          <input id="q_subtotal" name="q_subtotal" type="number" min="0.01" step="0.01" required value={d.subtotal} onChange={(e) => patch({ subtotal: e.target.value })} className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="q_tax_rate">Tax rate (%)</label>
          <input id="q_tax_rate" name="q_tax_rate" type="number" min="0" max="100" step="0.01" required value={d.rate} onChange={(e) => patch({ rate: e.target.value })} className={input} placeholder="e.g. 5 for GST" />
        </div>
      </div>
      {ready && (
        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm">
          Tax {money(tax)} · <strong>Total {money(cents(s) + tax)}</strong>
        </p>
      )}
      <label className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
        <input type="checkbox" name="q_confirm" required className="mt-0.5" />
        <span>I confirm this price and scope were agreed with the customer, and record the quote as accepted.</span>
      </label>
    </Card>
  );
}
