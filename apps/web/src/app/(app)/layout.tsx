import { redirect } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/supabase/session";
import { chatEnabled } from "@/lib/assistant/chat";
import { ChatPanel } from "./chat-panel";
import { supportConfig } from "@/lib/support";
import { HelpButton } from "./help";
import { MobileNav, Nav } from "./nav";

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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-walnut p-5 text-cream md:flex">
        <div className="mb-6 border-b border-white/10 pb-5">
          <Image src="/logo.png" alt="Smith Bros" width={96} height={64} priority className="h-auto w-[96px]" />
          <p className="mt-2.5 text-[9px] uppercase tracking-[0.3em] text-gold">Command Centre</p>
        </div>
        <Nav position="main" />
        <div className="mt-auto border-t border-white/10 pt-4">
          <Nav position="bottom" />
          {help && <HelpButton help={help} variant="sidebar" />}
        </div>
        <form action={signOut} className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
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
      <header className="flex items-center justify-between bg-walnut px-4 py-3 text-cream md:hidden">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Smith Bros" width={52} height={35} className="h-auto w-[52px]" />
          <p className="text-[9px] uppercase tracking-[0.3em] text-gold">Command Centre</p>
        </div>
        <form action={signOut}>
          <button aria-label="Sign out" className="p-2 text-cream/60">
            <LogOut size={18} />
          </button>
        </form>
      </header>
      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:p-8 md:pb-8 lg:p-10">
        {children}
      </main>
      <MobileNav help={help} />
      <ChatPanel enabled={chatEnabled()} />
    </div>
  );
}
