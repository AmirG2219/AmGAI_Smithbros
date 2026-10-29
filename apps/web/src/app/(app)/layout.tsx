import { redirect } from "next/navigation";
import { loadNavCounts } from "@/lib/dashboard/overview";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/supabase/session";
import { supportConfig } from "@/lib/support";
import { AppShell, preferenceScript } from "./shell";

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
  const me = await getMe();
  const help = supportConfig();
  if (!me) redirect("/login");

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

  // Badge counts for the sidebar. They refresh whenever a page or action revalidates; there is no background polling.
  const counts = await loadNavCounts(await createClient()).catch(() => null);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: preferenceScript }} />
      <AppShell user={{ name: me.display_name, role: me.role }} help={help} counts={counts} signOut={signOut}>
        {children}
      </AppShell>
    </>
  );
}
