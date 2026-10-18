import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const supabase = await createClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, source, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Contacts</h1>
      {error && <p className="text-red-700">Could not load contacts.</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-bronze">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Source</th>
              <th className="p-3">Added</th>
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  {c.first_name} {c.last_name}
                </td>
                <td className="p-3">{c.email ?? "—"}</td>
                <td className="p-3">{c.phone ?? "—"}</td>
                <td className="p-3">{c.source ?? "—"}</td>
                <td className="p-3">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-bronze">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
