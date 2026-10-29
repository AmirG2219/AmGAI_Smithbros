"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, Eye, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Card } from "../ui";
import { generateAgreementsAction, reviewAction, type ReviewState } from "./actions";
import { ScopeText } from "./scope-text";
import { pretty } from "@/lib/agreements/status";
import { longDate, money } from "@/lib/agreements/vars";
import type { Review } from "@/lib/agreements/prepare";

// Every value the review shows is sent back unchanged, so what is generated is what was reviewed (the server checks it again).
function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) =>
        v.includes("\n") ? <textarea key={k} name={k} defaultValue={v} hidden readOnly /> : <input key={k} type="hidden" name={k} value={v} readOnly />,
      )}
    </>
  );
}

function Section({ title, onEdit, href, children }: { title: string; onEdit?: () => void; href?: string; children: React.ReactNode }) {
  const cls = "text-sm text-bronze hover:text-walnut";
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow">{title}</p>
        {href ? <Link href={href} className={cls}>Edit</Link> : onEdit ? <button type="button" onClick={onEdit} className={cls}>Edit</button> : null}
      </div>
      {children}
    </Card>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const Missing = ({ children = "Not entered yet" }: { children?: string }) => <span className="text-amber-700 dark:text-amber-400">{children}</span>;

function Generate({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending} className="rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60">
      {pending ? "Generating documents…" : "Generate documents"}
    </button>
  );
}

function ReviewPanel({ review, edit, links }: { review: Review; edit: () => void; links: { customer: string; project: string; type: string } }) {
  const [gen, genAction] = useActionState(generateAgreementsAction, null);
  const { customer, project, contract, docs, blockers, values } = review;
  const contact = [customer.email, customer.phone].filter(Boolean).join(" · ");
  const incomplete = docs.filter((d) => d.missing.length);
  const money_ = (n: number | null) => (n === null ? <Missing /> : money(n));

  return (
    <div className="grid gap-4">
      <Section title="Customer and project" href={links.customer}>
        <Rows
          rows={[
            ["Customer", <strong key="n">{customer.name}</strong>],
            ["Contact", contact || <Missing>None on file</Missing>],
            ["Project", project.name ? `${project.name} · ${pretty(project.type)}` : pretty(project.type)],
            ["Job site", project.site || <Missing />],
            ["Agreement type", docs.map((d) => d.name).join(" and ")],
          ]}
        />
        <p className="mt-2 text-xs text-muted">
          <Link href={links.project} className="text-bronze hover:text-walnut">Change project</Link> · <Link href={links.type} className="text-bronze hover:text-walnut">Change agreement type</Link>
        </p>
      </Section>

      {contract && (
        <>
          <Section title="Scope of work" onEdit={edit}>
            <p className="mb-2 text-xs text-muted">
              {contract.source === "accepted" ? "From the accepted final quote on file. It cannot be changed here." : "Entered now as agreed with the customer. It is recorded as the accepted final quote when you generate."}
            </p>
            <ScopeText text={contract.scope} />
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.15em] text-muted">Excluded work</p>
              <p className="whitespace-pre-line text-sm">{contract.exclusions || "None stated."}</p>
            </div>
          </Section>

          <Section title="Price and contract terms" onEdit={edit}>
            <Rows
              rows={[
                ["Price source", contract.source === "accepted" ? "Accepted final quote" : "Agreed with the customer (entered by staff)"],
                ["Price before tax", money(contract.subtotal)],
                ["Tax", `${money(contract.tax)}${contract.taxRate !== null ? ` (${contract.taxRate}%)` : ""}`],
                ["Total", <strong key="t">{money(contract.total)}</strong>],
                ["Deposit", contract.depositPercent === null ? <Missing /> : <>{contract.depositPercent}% · {money_(contract.deposit)}</>],
                ["Balance on completion", money_(contract.balance)],
                ["Payment terms", contract.paymentTerms || "No additional payment terms."],
                ["Planned start", contract.startDate ? longDate(new Date(`${contract.startDate}T12:00:00`)) : <Missing />],
                ["Estimated completion", contract.completion || <Missing />],
              ]}
            />
          </Section>
        </>
      )}

      <Section title="Documents">
        <ul className="grid gap-2">
          {docs.map((d) => (
            <li key={d.type} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
              <span>
                <Check size={14} className="mr-1.5 inline text-bronze" />
                <strong>{d.name}</strong>
                {d.placeholder && <span className="ml-2 rounded-full border border-amber-300 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">Placeholder template</span>}
              </span>
              <form method="post" action="/api/agreements/preview-draft" target="_blank">
                <Hidden values={{ ...values, type: d.type }} />
                <button className="inline-flex items-center gap-1.5 text-bronze hover:text-walnut"><Eye size={14} /> Preview PDF</button>
              </form>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">The preview is built from the values above and is not saved. Nothing is created or sent until you generate.</p>
        {incomplete.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Still to complete in the draft before the final PDF can be generated:{" "}
            {incomplete.map((d) => `${d.name} (${d.missing.join(", ")})`).join("; ")}.
          </p>
        )}
      </Section>

      {blockers.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4 sm:p-5">
          <p className="mb-2 flex items-center gap-2 font-medium text-amber-900"><TriangleAlert size={18} /> These documents can&apos;t be created yet</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-amber-900">
            {blockers.map((b) => (
              <li key={b.text}>{b.text} {b.href && <Link href={b.href} className="underline">Open</Link>}</li>
            ))}
          </ul>
        </Card>
      )}

      <form action={genAction} className="grid gap-3">
        <Hidden values={values} />
        {gen?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{gen.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={edit} className="inline-flex items-center gap-1 text-sm text-muted hover:text-walnut"><ArrowLeft size={14} /> Back to details</button>
          <Generate disabled={blockers.length > 0} />
          <span className="text-xs text-muted">Creates the draft documents. Nothing is emailed.</span>
        </div>
      </form>
    </div>
  );
}

// Wraps the Step 4 details. "Review agreement" has the server check the values and returns the review; Edit goes back to the
// same form, which stays mounted so nothing typed is lost.
export function AgreementReview({
  customerId,
  projectId,
  docsKey,
  children,
}: {
  customerId: string;
  projectId: string;
  docsKey: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ReviewState>(null);
  const [view, setView] = useState<"form" | "review">("form");
  const [checking, startChecking] = useTransition();
  const top = useRef<HTMLDivElement>(null);
  const show = (v: "form" | "review") => {
    setView(v);
    top.current?.scrollIntoView({ block: "start" });
  };

  const links = {
    customer: "/agreements/new",
    project: `/agreements/new?customer=${customerId}${docsKey ? `&docs=${docsKey}` : ""}`,
    type: `/agreements/new?customer=${customerId}&project=${projectId}`,
  };

  return (
    <div ref={top} className="scroll-mt-20">
      <form
        className={view === "form" ? "grid gap-4" : "hidden"}
        // A plain submit handler, not a form action: React would reset the untouched fields after an action finishes.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startChecking(async () => {
            const r = await reviewAction(null, fd);
            setState(r);
            if (r && "review" in r) show("review");
          });
        }}
      >
        <input type="hidden" name="customer" value={customerId} />
        <input type="hidden" name="project" value={projectId} />
        <input type="hidden" name="docs" value={docsKey} />
        <p className="eyebrow mt-1">Step 4 · Details</p>
        {children}
        {state?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={checking} className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60">{checking ? "Checking…" : "Review agreement"}</button>
          <span className="text-xs text-muted">You&apos;ll check everything before anything is created.</span>
        </div>
      </form>
      {view === "review" && state && "review" in state && (
        <>
          <p className="eyebrow mb-3 mt-1">Step 5 · Review and generate</p>
          <ReviewPanel review={state.review} edit={() => show("form")} links={links} />
        </>
      )}
    </div>
  );
}
