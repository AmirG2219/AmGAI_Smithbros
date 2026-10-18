import { redirect } from "next/navigation";
import { getMe } from "@/lib/supabase/session";

// Server actions use the full-access client, so every one must first confirm the caller is an active admin.
// getMe() runs as the signed-in user, and the database only returns the row for an active user.
export async function requireAdmin() {
  const me = await getMe();
  if (!me || me.role !== "admin") redirect("/login");
  return me as { id: string; display_name: string; role: "admin" };
}
