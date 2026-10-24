// Runs once when the server starts.
//
// Every page talks to the database over HTTPS. Opening a fresh secure connection costs 0.3 to 1 second on a slow
// link, and Node closes idle connections after only 4 seconds, so clicking around paid that cost again and again.
// This keeps connections open much longer and keeps a few warm, so navigation reuses them.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { Agent, setGlobalDispatcher } = await import("undici");

  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 120_000,
      keepAliveMaxTimeout: 600_000,
      connections: 24,
      connect: { timeout: 10_000 },
    }),
  );

  // On a long-running server (local, or a dedicated host) keep a pool of connections warm between clicks.
  // Serverless hosts freeze between requests, so this is skipped there.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!process.env.VERCEL && url && key) {
    const warm = () =>
      Promise.allSettled(
        Array.from({ length: 16 }, () =>
          fetch(`${url}/rest/v1/`, { method: "HEAD", headers: { apikey: key }, signal: AbortSignal.timeout(8_000) }),
        ),
      );
    void warm();
    setInterval(() => void warm(), 20_000).unref();
  }
}
