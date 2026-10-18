import { cache } from "react";
import { createClient } from "./server";

// Who is signed in, checked once per request however many components ask.
//
// getClaims() verifies the sign-in token's signature on this server using the project's public signing key
// (cached after the first fetch), so it costs no network round trip. getUser() asks the Auth service every
// time (about a quarter of a second each). Data access is still enforced by the database on every query.
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

export type Me = { id: string; display_name: string; role: "admin" | "support" };

// The signed-in person's dashboard record. The database only returns it for an active user, so a deactivated
// account gets null here and sees nothing.
export const getMe = cache(async (): Promise<Me | null> => {
  const id = await getUserId();
  if (!id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_users")
    .select("id, display_name, role")
    .eq("id", id)
    .maybeSingle();
  return (data as Me | null) ?? null;
});

// The signed-in person's login email, read from their verified token.
export const getEmail = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims as { email?: string } | undefined)?.email;
  return email ?? null;
});
