import { consentByAddress } from "@/lib/campaigns/audience";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, td, th } from "../ui";
import { recordConsent } from "./actions";

type Status = "consent" | "unsubscribed" | "none";

const input = "w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-bronze";

function Marketing({ id, status, hasEmail }: { id: string; status: Status; hasEmail: boolean }) {
  if (!hasEmail) return <span className="text-muted">No email</span>;
  const grant = recordConsent.bind(null, id);
  return (
    <div>
      {status === "consent" && <Pill kind="warm">Consent</Pill>}
      {status === "unsubscribed" && <Pill kind="cold">Unsubscribed</Pill>}
      {status === "none" && <span className="text-xs text-muted">No consent</span>}
      {status !== "unsubscribed" && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-bronze">
            {status === "consent" ? "Manage" : "Record consent"}
          </summary>
          <form action={grant} className="mt-2 grid gap-2 rounded-lg border border-line bg-white p-3">
            <input type="hidden" name="action" value="grant" />
            <select name="legal_basis" className={input} defaultValue="express" aria-label="Basis">
              <option value="express">Express (they asked or agreed)</option>
              <option value="implied">Implied (existing customer)</option>
              <option value="other_verified">Other, verified</option>
            </select>
            <input name="source" required placeholder="How and when? e.g. signed contract Oct 2026" className={input} />
            <button className="rounded-lg bg-walnut px-3 py-1.5 text-xs font-medium text-cream hover:bg-bronze">
              Save consent
            </button>
          </form>
          {status === "consent" && (
            <form action={grant} className="mt-2">
              <input type="hidden" name="action" value="withdraw" />
              <input type="hidden" name="source" value="Withdrawn by staff in dashboard" />
              <button className="text-xs text-muted underline">Withdraw consent</button>
            </form>
          )}
        </details>
      )}
    </div>
  );
}

export default async function Contacts() {
  const supabase = await createClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, email_normalized, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = contacts ?? [];

  // Current marketing status per address, derived from the evidence log (same rule the sender uses).
  const emails = rows.map((c) => c.email_normalized).filter(Boolean) as string[];
  const [{ data: ev }, { data: sup }] = emails.length
    ? await Promise.all([
        supabase
          .from("consent_events")
          .select("address_normalized, event_type, valid_until")
          .eq("channel", "email")
          .eq("purpose", "marketing")
          .in("address_normalized", emails)
          .in("event_type", ["granted", "withdrawn"])
          .order("occurred_at", { ascending: false }),
        supabase
          .from("suppressions")
          .select("address_normalized")
          .eq("channel", "email")
          .is("cleared_at", null)
          .in("scope", ["marketing", "all_outbound"])
          .in("address_normalized", emails),
      ])
    : [{ data: [] }, { data: [] }];

  const granted = consentByAddress(ev ?? []);
  const blocked = new Set((sup ?? []).map((s) => s.address_normalized));
  const statusOf = (email: string | null): Status =>
    !email ? "none" : blocked.has(email) ? "unsubscribed" : granted.get(email) ? "consent" : "none";

  return (
    <div>
      <PageHeader eyebrow="Customers" title="Contacts" />
      {error && <p className="mb-4 text-red-700">Could not load contacts.</p>}

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((c) => (
          <Card key={c.id} className="p-4">
            <p className="font-medium">
              {c.first_name} {c.last_name}
            </p>
            <p className="text-sm text-muted">{c.email ?? "—"}</p>
            <p className="mb-3 text-sm text-muted">{c.phone ?? "—"}</p>
            <Marketing id={c.id} status={statusOf(c.email_normalized)} hasEmail={!!c.email} />
          </Card>
        ))}
        {rows.length === 0 && <Card className="px-6 py-10 text-center text-sm text-muted">No contacts yet.</Card>}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Phone</th>
              <th className={th}>Marketing email</th>
              <th className={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line align-top last:border-0">
                <td className={`${td} font-medium`}>
                  {c.first_name} {c.last_name}
                </td>
                <td className={`${td} text-muted`}>{c.email ?? "—"}</td>
                <td className={`${td} text-muted`}>{c.phone ?? "—"}</td>
                <td className={td}>
                  <Marketing id={c.id} status={statusOf(c.email_normalized)} hasEmail={!!c.email} />
                </td>
                <td className={`${td} text-muted`}>
                  {new Date(c.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
