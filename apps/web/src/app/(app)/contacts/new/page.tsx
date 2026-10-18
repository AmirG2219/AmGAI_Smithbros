import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MANUAL_SOURCES, SOURCE_LABELS } from "@/lib/contacts/sources";
import { Card, PageHeader } from "../../ui";
import { createContact } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

export default async function NewContact({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div>
      <Link href="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Clients
      </Link>
      <PageHeader eyebrow="Clients" title="Add client" />
      {error && (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}
      <form action={createContact} className="max-w-xl">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="first_name">First name *</label>
            <input id="first_name" name="first_name" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="source">How did they come to us?</label>
            <select id="source" name="source" defaultValue="manual" className={input}>
              {MANUAL_SOURCES.map((v) => (
                <option key={v} value={v}>
                  {SOURCE_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
        </Card>
        <button className="mt-5 rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze">
          Add client
        </button>
      </form>
    </div>
  );
}
