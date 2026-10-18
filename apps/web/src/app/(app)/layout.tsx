import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const nav = [
  { href: "/", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/contacts", label: "Contacts" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS only returns this row for an active dashboard user.
  const { data: me } = await supabase
    .from("app_users")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || me.role !== "admin") {
    return (
      <main className="p-10">
        <p>This account has no dashboard access.</p>
        <form action={signOut}>
          <button className="mt-4 underline">Sign out</button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col bg-walnut p-5 text-cream">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold">
          Smith Bros Floors
        </p>
        <p className="mb-8 text-lg font-semibold">Command Centre</p>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-3 py-2 hover:bg-bronze/30"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-sm">
          <p className="text-cream/70">{me.display_name}</p>
          <form action={signOut}>
            <button className="mt-1 text-gold underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
