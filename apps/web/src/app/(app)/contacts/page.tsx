import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, td, th } from "../ui";

export default async function Contacts() {
  const supabase = await createClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, source, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader eyebrow="Customers" title="Contacts" />
      {error && <p className="mb-4 text-red-700">Could not load contacts.</p>}
      {/* Phones: one card per contact */}
      <div className="flex flex-col gap-3 md:hidden">
        {(contacts ?? []).map((c) => (
          <Card key={c.id} className="p-4">
            <p className="font-medium">
              {c.first_name} {c.last_name}
            </p>
            <p className="text-sm text-muted">{c.email ?? "—"}</p>
            <p className="text-sm text-muted">{c.phone ?? "—"}</p>
          </Card>
        ))}
        {(contacts ?? []).length === 0 && (
          <Card className="px-6 py-10 text-center text-sm text-muted">No contacts yet.</Card>
        )}
      </div>
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Phone</th>
              <th className={th}>Source</th>
              <th className={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className={`${td} font-medium`}>
                  {c.first_name} {c.last_name}
                </td>
                <td className={`${td} text-muted`}>{c.email ?? "—"}</td>
                <td className={`${td} text-muted`}>{c.phone ?? "—"}</td>
                <td className={`${td} text-muted`}>{c.source ?? "—"}</td>
                <td className={`${td} text-muted`}>
                  {new Date(c.created_at).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && (
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
