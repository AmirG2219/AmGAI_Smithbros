"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCustomerAction, type CustomerFormState } from "./actions";
import { input, labelCls } from "./client";

const go = "rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60";

function Buttons({ matched }: { matched: boolean }) {
  const { pending } = useFormStatus();
  return matched ? (
    <button name="confirm_new" value="1" disabled={pending} className="rounded-lg border border-walnut px-4 py-2 text-sm font-medium hover:bg-walnut hover:text-cream disabled:opacity-60">
      {pending ? "Adding…" : "No, add as a separate customer"}
    </button>
  ) : (
    <button disabled={pending} className={go}>{pending ? "Adding…" : "Add and continue"}</button>
  );
}

// Inline "add a customer" form. Typed values stay put if something needs confirming or fixing.
export function AddCustomer() {
  const [state, formAction] = useActionState<CustomerFormState, FormData>(createCustomerAction, null);
  const [v, setV] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const matches = state?.matches;

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor="first_name">First name</label>
        <input id="first_name" name="first_name" required value={v.first_name} onChange={set("first_name")} className={input} />
      </div>
      <div>
        <label className={labelCls} htmlFor="last_name">Last name</label>
        <input id="last_name" name="last_name" value={v.last_name} onChange={set("last_name")} className={input} />
      </div>
      <div>
        <label className={labelCls} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" value={v.email} onChange={set("email")} className={input} />
      </div>
      <div>
        <label className={labelCls} htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" value={v.phone} onChange={set("phone")} className={input} />
      </div>

      {state?.error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</p>}

      {matches && (
        <div className="rounded-lg border border-gold/50 bg-gold/10 px-3.5 py-3 text-sm sm:col-span-2">
          <p className="font-medium">This phone number is already on file. Is it the same customer?</p>
          <ul className="mt-2 grid gap-1.5">
            {matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                <span>
                  <strong>{m.name}</strong>
                  <span className="text-muted">{[m.email, m.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </span>
                <Link href={`/agreements/new?customer=${m.id}`} className="font-medium text-bronze hover:text-walnut">Yes, use this customer</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Buttons matched={!!matches} />
        {!matches && <span className="text-xs text-muted">The same email is treated as the same customer. A matching phone number will ask you to confirm.</span>}
      </div>
    </form>
  );
}
