"use client";

import { useState } from "react";
import { Card } from "../ui";
import { input, labelCls } from "./client";
import { cents, money } from "@/lib/agreements/vars";

// Shown only when a work contract has no accepted final quote yet. Staff type in what was agreed with the customer;
// nothing is pre-filled, and the quote is only recorded as accepted if the confirmation box is ticked.
export function QuoteFields() {
  const [subtotal, setSubtotal] = useState("");
  const [rate, setRate] = useState("");
  const s = Number(subtotal);
  const r = Number(rate);
  const ready = subtotal !== "" && rate !== "" && Number.isFinite(s) && Number.isFinite(r) && s > 0 && r >= 0;
  const tax = ready ? cents((cents(s) * r) / 100) : 0;

  return (
    <Card className="border-bronze/40 p-4 sm:p-5">
      <p className="eyebrow mb-1">Agreed price and scope</p>
      <p className="mb-3 text-sm text-muted">
        This project has no accepted final quote yet. Enter what you agreed with the customer; it is saved as the accepted final quote the contract is built from.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="q_scope">Scope of work</label>
          <textarea id="q_scope" name="q_scope" rows={4} required className={input} placeholder="What work is included" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="q_exclusions">Exclusions (optional)</label>
          <textarea id="q_exclusions" name="q_exclusions" rows={2} className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="q_subtotal">Agreed price before tax (CAD)</label>
          <input id="q_subtotal" name="q_subtotal" type="number" min="0.01" step="0.01" required value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="q_tax_rate">Tax rate (%)</label>
          <input id="q_tax_rate" name="q_tax_rate" type="number" min="0" max="100" step="0.01" required value={rate} onChange={(e) => setRate(e.target.value)} className={input} placeholder="e.g. 5 for GST" />
        </div>
      </div>
      {ready && (
        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm">
          Tax {money(tax)} · <strong>Total {money(cents(s) + tax)}</strong>
        </p>
      )}
      <label className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2.5 text-sm">
        <input type="checkbox" name="q_confirm" required className="mt-0.5" />
        <span>I confirm this price and scope were agreed with the customer, and record the quote as accepted.</span>
      </label>
    </Card>
  );
}
