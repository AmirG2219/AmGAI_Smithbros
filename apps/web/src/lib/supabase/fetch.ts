// A fetch that rescues a stalled read.
//
// Occasionally a new connection to the database stalls for 10 seconds or more (packet loss on the way). For read-only
// requests, if no answer has come back after a moment, the same request is sent again on a fresh connection and
// whichever answers first wins. Writes are never repeated.

const HEDGE_AFTER_MS = 2_500;
const READ_RPCS = /\/rest\/v1\/rpc\/(waiting_on_customers|unbooked_leads|email_panel)(\?|$)/;

export const resilientFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const safeToRepeat = typeof input === "string" || input instanceof URL ? method === "GET" || method === "HEAD" || READ_RPCS.test(url) : false;
  if (!safeToRepeat) return fetch(input, init);

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let hedged = false;
    let failures = 0;

    const launch = () => {
      fetch(input, init).then(
        (r) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(r);
        },
        (e) => {
          failures++;
          // The first try failed outright: try again straight away. If every try fails, report it.
          if (!hedged) hedge();
          else if (failures >= 2 && !settled) {
            settled = true;
            clearTimeout(timer);
            reject(e);
          }
        },
      );
    };
    const hedge = () => {
      if (hedged || settled) return;
      hedged = true;
      launch();
    };

    const timer = setTimeout(hedge, HEDGE_AFTER_MS);
    launch();
  });
};
