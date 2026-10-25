import { Card } from "../ui";
import { input, labelCls } from "./client";
import { QuoteFields } from "./quote-fields";
import { money, type DocType, type Inputs, type Quote } from "@/lib/agreements/vars";

function Field({ name, title, hint, children }: { name: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>{title}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// What is filled in automatically (read only) plus the fields staff complete. Shared by the builder and the draft editor.
export function DraftFields({
  types,
  clientName,
  quote,
  values,
  quoteEntry = false,
}: {
  types: DocType[];
  clientName: string;
  quote: Quote | null;
  values: Inputs;
  quoteEntry?: boolean; // contract with no accepted quote: let staff record the agreed price
}) {
  const contract = types.includes("work_contract");
  return (
    <>
      {contract && quoteEntry && !quote && <QuoteFields />}
      <Card className="p-4 sm:p-5">
        <p className="eyebrow mb-3">Filled in automatically</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Customer</dt>
          <dd>{clientName}</dd>
          {contract && quote && (
            <>
              <dt className="text-muted">Accepted quote</dt>
              <dd>
                {money(quote.subtotal)} + {money(quote.tax)} tax = <strong>{money(quote.subtotal + quote.tax)}</strong>
              </dd>
              <dt className="text-muted">Scope of work</dt>
              <dd className="whitespace-pre-line">{quote.scope}</dd>
              {quote.exclusions && (
                <>
                  <dt className="text-muted">Exclusions</dt>
                  <dd className="whitespace-pre-line">{quote.exclusions}</dd>
                </>
              )}
            </>
          )}
        </dl>
        {contract && quote && <p className="mt-3 text-xs text-muted">The scope and price come from the accepted final quote and cannot be changed here.</p>}
      </Card>

      <Card className="p-4 sm:p-5">
        <p className="eyebrow mb-3">Details to complete</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="site_address" title="Job site address">
              <input id="site_address" name="site_address" defaultValue={values.site_address} required className={input} />
            </Field>
          </div>
          {contract && (
            <>
              <Field name="client_email" title="Customer email">
                <input id="client_email" name="client_email" type="email" defaultValue={values.client_email} className={input} />
              </Field>
              <Field name="client_phone" title="Customer phone">
                <input id="client_phone" name="client_phone" type="tel" defaultValue={values.client_phone} className={input} />
              </Field>
              <Field name="deposit_percent" title="Deposit on signing (%)" hint="Agreed with the customer. Required to generate the PDF.">
                <input id="deposit_percent" name="deposit_percent" type="number" min="0" max="100" step="0.01" defaultValue={values.deposit_percent} className={input} />
              </Field>
              <Field name="start_date" title="Planned start">
                <input id="start_date" name="start_date" type="date" defaultValue={values.start_date} className={input} />
              </Field>
              <div className="sm:col-span-2">
                <Field name="completion_estimate" title="Estimated completion">
                  <input id="completion_estimate" name="completion_estimate" defaultValue={values.completion_estimate} placeholder="e.g. 2 weeks after start" className={input} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field name="payment_terms" title="Other payment terms (optional)">
                  <textarea id="payment_terms" name="payment_terms" rows={2} defaultValue={values.payment_terms} className={input} />
                </Field>
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">These values only go into this document. The customer and project records are not changed.</p>
      </Card>
    </>
  );
}
