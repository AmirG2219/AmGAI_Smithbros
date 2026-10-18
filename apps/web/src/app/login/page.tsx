import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function signIn(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect("/login?error=1");
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-walnut px-4">
      <form
        action={signIn}
        className="w-full max-w-sm rounded-lg bg-cream p-8 shadow-xl"
      >
        <Image src="/logo.png" alt="Smith Bros" width={120} height={80} priority className="mx-auto mb-3 h-auto w-[120px]" />
        <p className="mb-6 text-center text-xs uppercase tracking-[0.3em] text-bronze">Command Centre</p>
        <label className="block text-sm mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mb-4 w-full rounded border border-line bg-white px-3 py-2"
        />
        <label className="block text-sm mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="mb-4 w-full rounded border border-line bg-white px-3 py-2"
        />
        {error && (
          <p className="mb-4 text-sm text-red-700">
            Sign-in failed. Check your email and password.
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded bg-walnut py-2 font-medium text-cream hover:bg-bronze"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
