"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createLeadAction, type NewLeadState } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";
const go = "rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60";

type Option = [value: string, label: string];

function Buttons({ matched }: { matched: boolean }) {
  const { pending } = useFormStatus();
  return matched ? (
    <button name="confirm_new" value="1" disabled={pending} className="rounded-lg border border-walnut px-4 py-2 text-sm font-medium hover:bg-walnut hover:text-cream disabled:opacity-60">
      {pending ? "Saving…" : "No, create as a separate customer"}
    </button>
  ) : (
    <button disabled={pending} className={go}>{pending ? "Saving…" : "Create lead"}</button>
  );
}

// One form for the whole lead. Uncontrolled inputs keep what was typed if something needs confirming or fixing.
export function NewLeadForm({
  customerId,
  sources,
  projectTypes,
  timelines,
}: {
  customerId: string | null;
  sources: Option[];
  projectTypes: Option[];
  timelines: Option[];
}) {
  const [state, formAction] = useActionState<NewLeadState, FormData>(createLeadAction, null);
  // Generated once per form, so a double click can never create two leads.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const matches = state?.matches;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="submission_key" value={submissionKey} />
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}

      {!customerId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" required className={input} />
          </div>
          <div>
            <label className={labelCls} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" className={input} />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className={input} />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" className={input} />
          </div>
          <p className="text-xs text-muted sm:col-span-2">
            The same email is treated as the same customer. A matching phone number will ask you to confirm.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="lead_source">How did they get in touch?</label>
          <select id="lead_source" name="lead_source" required defaultValue="" className={input}>
            <option value="" disabled>Choose…</option>
            {sources.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="project_type">Project type</label>
          <select id="project_type" name="project_type" defaultValue="" className={input}>
            <option value="">Not known yet</option>
            {projectTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="square_footage">Square footage</label>
          <input id="square_footage" name="square_footage" inputMode="decimal" placeholder="e.g. 800" className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="timeline">When do they want to start?</label>
          <select id="timeline" name="timeline" defaultValue="" className={input}>
            <option value="">Not known yet</option>
            {timelines.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="site_address_line1">Job site address</label>
          <input id="site_address_line1" name="site_address_line1" autoComplete="off" className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="site_city">City</label>
          <input id="site_city" name="site_city" className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="site_postal_code">Postal code</label>
          <input id="site_postal_code" name="site_postal_code" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={4} placeholder="What they said, what they're after, anything to follow up on…" className={input} />
        </div>
      </div>

      {state?.error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}

      {matches && (
        <div className="rounded-lg border border-gold/50 bg-gold/10 px-3.5 py-3 text-sm">
          <p className="font-medium">This phone number is already on file. Is it the same customer?</p>
          <ul className="mt-2 grid gap-1.5">
            {matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <span>
                  <strong>{m.name}</strong>
                  <span className="text-muted">{[m.email, m.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </span>
                <button name="use_customer" value={m.id} className="font-medium text-bronze hover:text-walnut">Yes, use this customer</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Buttons matched={!!matches} />
        <span className="text-xs text-muted">Only the source is required. Anything left blank is flagged for review. No price is calculated and no email is sent.</span>
      </div>
    </form>
  );
}
