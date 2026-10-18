"use client";

import { useRef, useState } from "react";

const field =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

// Demo version of the website inquiry form. The real website posts the same JSON to /api/intake.
export default function InquiryPage() {
  const key = useRef<string>("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    key.current ||= crypto.randomUUID(); // same key on retry, so a double-submit cannot create two leads
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, submission_key: key.current }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setState("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  if (state === "done")
    return (
      <main className="flex min-h-screen items-center justify-center bg-walnut px-4">
        <div className="max-w-md rounded-2xl bg-cream p-10 text-center">
          <h1 className="font-serif text-4xl">Thank you</h1>
          <p className="mt-3 text-sm text-muted">
            We&apos;ve received your inquiry and will be in touch shortly.
          </p>
        </div>
      </main>
    );

  return (
    <main className="flex min-h-screen items-center justify-center bg-walnut px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl rounded-2xl bg-cream p-5 shadow-xl sm:p-8"
      >
        <p className="eyebrow text-bronze">Smith Bros Floors</p>
        <h1 className="mb-6 mt-1 font-serif text-4xl">Request an estimate</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="city">City</label>
            <input id="city" name="city" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="postal_code">Postal code</label>
            <input id="postal_code" name="postal_code" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="project_type">Project type</label>
            <select id="project_type" name="project_type" required className={field} defaultValue="">
              <option value="" disabled>Select…</option>
              <option value="new_installation">New installation</option>
              <option value="sand_refinish">Sand &amp; refinish</option>
              <option value="restoration">Restoration</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="material">Material</label>
            <select id="material" name="material" required className={field} defaultValue="">
              <option value="" disabled>Select…</option>
              <option value="hardwood">Hardwood</option>
              <option value="engineered">Engineered wood</option>
              <option value="laminate">Laminate</option>
              <option value="vinyl">Vinyl</option>
              <option value="tile">Tile</option>
              <option value="unsure">Not sure yet</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="square_footage">Approx. square feet</label>
            <input id="square_footage" name="square_footage" type="number" min="1" step="any" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="timeline">Timeline</label>
            <select id="timeline" name="timeline" required className={field} defaultValue="">
              <option value="" disabled>Select…</option>
              <option value="asap">As soon as possible</option>
              <option value="1_3_months">1–3 months</option>
              <option value="3_6_months">3–6 months</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={label} htmlFor="notes">Anything else?</label>
          <textarea id="notes" name="notes" rows={3} className={field} />
        </div>

        {/* Honeypot: hidden from people, tempting to bots */}
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px]"
        />

        {state === "error" && <p className="mt-4 text-sm text-red-700">{message}</p>}
        <button
          type="submit"
          disabled={state === "sending"}
          className="mt-6 w-full rounded-lg bg-walnut py-3 font-medium text-cream hover:bg-bronze disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Get my estimate"}
        </button>
      </form>
    </main>
  );
}
