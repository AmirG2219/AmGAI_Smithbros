import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "../../ui";
import { createContact } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

export default async function NewContact({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div>
      <Link href="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Contacts
      </Link>
      <PageHeader eyebrow="Contacts" title="Add contact" />
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
          <p className="text-xs text-muted sm:col-span-2">
            Adding a contact does not give permission to send them marketing email. Record that on the Contacts
            list once you have their consent.
          </p>
        </Card>
        <button className="mt-5 rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze">
          Add contact
        </button>
      </form>
    </div>
  );
}
