import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "./nav";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-walnut p-5 text-cream">
        <div className="mb-8 border-b border-white/10 pb-6">
          <p className="font-serif text-2xl leading-none">Smith Bros</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-gold">
            Command Centre
          </p>
        </div>
        <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.25em] text-cream/30">
          Main
        </p>
        <Nav />
        <form
          action={signOut}
          className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bronze font-medium">
            {me.display_name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">{me.display_name}</p>
            <p className="text-[10px] uppercase tracking-widest text-cream/40">
              {me.role}
            </p>
          </div>
          <button aria-label="Sign out" className="text-cream/50 hover:text-gold">
            <LogOut size={16} />
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-8 lg:p-10">{children}</main>
    </div>
  );
}
