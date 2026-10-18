import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server actions use the full-access client, so every one must first confirm the caller is an active admin.
// The select below runs as the signed-in user, and RLS only returns their own row if they are active.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("app_users")
    .select("id, display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.role !== "admin") redirect("/login");
  return me as { id: string; display_name: string; role: "admin" };
}
