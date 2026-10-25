import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { explicitProjectId, groupConversations, loadContactConversations, withoutInferredProjects } from "./links";
import { parseInbound, storeInboundEmail } from "../assistant/inbound";
import { customerEmailReady, replyToAddress, replyToConfigured } from "../email/reply-to";
import { sendBlockers } from "../agreements/send";
import { sendRecordedEmail } from "../email/record";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

// In-memory stand-in for Supabase: only the calls these modules make. Enforces the unique (provider, provider_message_id) key.
function fakeDb(seed: Tables) {
  const t: Tables = { contacts: [], projects: [], inbox_emails: [], inbox_attachments: [], settings: [], conversations: [], messages: [], message_deliveries: [], ...seed };
  const from = (table: string) => {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let ins: Row[] = [];
    const filters: ((r: Row) => boolean)[] = [];
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      order: () => b,
      limit: () => b,
      update: (p: Row) => ((op = "update"), (patch = p), b),
      insert: (r: Row | Row[]) => ((op = "insert"), (ins = Array.isArray(r) ? r : [r]), b),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    async function run(): Promise<{ data?: Row[]; error?: { message: string; code?: string } }> {
      if (op === "insert") {
        if (table === "inbox_emails" && ins.some((r) => t.inbox_emails.some((x) => x.provider === r.provider && x.provider_message_id === r.provider_message_id)))
          return { error: { message: "duplicate key", code: "23505" } };
        const made = ins.map((r) => ({ id: `${table}-${t[table].length + 1}`, ...r }));
        t[table].push(...made);
        return { data: made };
      }
      let hit = t[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of hit) Object.assign(r, patch);
        return { data: hit };
      }
      if (table === "contacts") hit = hit.map((c) => ({ ...c, projects: t.projects.filter((p) => p.contact_id === c.id).map((p) => ({ id: p.id, created_at: p.created_at })) }));
      return { data: hit };
    }
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, t };
}

const ann = { id: "c-ann", email_normalized: "ann@example.com" };
const proj = (id: string, contact_id: string, created_at = "2026-01-01T00:00:00Z") => ({ id, contact_id, created_at });
const mail = (over: Record<string, unknown> = {}) => {
  const p = parseInbound({ provider_message_id: "m1", from_address: "ann@example.com", subject: "Hello", received_at: "2026-10-01T10:00:00Z", body_text: "Hi", ...over });
  assert.ok(p.ok);
  return p.ok ? p.value : (undefined as never);
};

// ---- Contact and project association ----

test("a customer with ONE project who emails about something else is linked to the contact, never to that project", async () => {
  const { db, t } = fakeDb({ contacts: [ann], projects: [proj("p1", "c-ann")] });
  await storeInboundEmail(db, mail({ subject: "Question about my invoice from another job" }));
  assert.equal(t.inbox_emails[0].contact_id, "c-ann");
  assert.equal(t.inbox_emails[0].project_id, null);
});

test("a customer with several projects: linked to the contact, no project is guessed", async () => {
  const { db, t } = fakeDb({ contacts: [ann], projects: [proj("p1", "c-ann", "2026-01-01T00:00:00Z"), proj("p2", "c-ann", "2026-06-01T00:00:00Z")] });
  await storeInboundEmail(db, mail());
  assert.equal(t.inbox_emails[0].contact_id, "c-ann");
  assert.equal(t.inbox_emails[0].project_id, null);
});

test("unknown senders, suppliers and company mail stay ordinary Inbox messages: no contact or project is created or linked", async () => {
  const { db, t } = fakeDb({ contacts: [ann], projects: [proj("p1", "c-ann")] });
  await storeInboundEmail(db, mail({ provider_message_id: "m2", from_address: "sales@supplier.example" }));
  await storeInboundEmail(db, mail({ provider_message_id: "m3", from_address: "staff@smithbros.example" }));
  assert.equal(t.inbox_emails.length, 2);
  assert.ok(t.inbox_emails.every((e) => e.contact_id === null && e.project_id === null));
  assert.equal(t.contacts.length, 1);
  assert.equal(t.projects.length, 1);
});

test("the same message delivered twice is stored once", async () => {
  const { db, t } = fakeDb({ contacts: [ann] });
  const first = await storeInboundEmail(db, mail());
  const second = await storeInboundEmail(db, mail());
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(t.inbox_emails.length, 1);
});

test("a stored project id is never treated as an explicit link: old guesses and single-project guesses look the same", () => {
  assert.equal(explicitProjectId({ project_id: "p1" }), null);
  assert.equal(explicitProjectId({ project_id: null }), null);
  const rows = withoutInferredProjects([
    { contact_id: "c-ann", project_id: "p2" }, // an old "latest project" guess
    { contact_id: "c-bob", project_id: "p3" }, // a customer's only project
    { contact_id: null, project_id: null },
  ]);
  assert.deepEqual(rows.map((r) => r.project_id), [null, null, null]);
});

test("existing email records are left as they are: showing them never rewrites them", () => {
  const stored = [{ id: "e1", contact_id: "c-ann", project_id: "p2" }];
  const shown = withoutInferredProjects(stored);
  assert.equal(stored[0].project_id, "p2");
  assert.equal(shown[0].project_id, null);
});

test("the project-facing code paths ignore stored project ids (Inbox card, AI draft context, sent replies, lead page)", () => {
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(read("assistant/drafts.ts"), /explicitProjectId\(e\)/);
  assert.match(read("assistant/send.ts"), /explicitProjectId\(email\)/);
  assert.match(read("assistant/inbound.ts"), /explicitProjectId\(e\)/);
  assert.doesNotMatch(read("assistant/inbound.ts"), /project_id: contact/);
  assert.doesNotMatch(read("../app/(app)/leads/[id]/page.tsx"), /inbox_emails|loadProjectConversations/);
});

const inboxRow = (id: string, contact_id: string | null, project_id: string | null, over: Row = {}) => ({
  id, contact_id, project_id, direction: "inbound", subject: `s-${id}`, received_at: `2026-10-0${id.slice(-1)}T10:00:00Z`, provider_thread_id: null, status: "open", ...over,
});

test("a contact page lists that contact's conversations only, each opening the original in the Inbox", async () => {
  const { db } = fakeDb({
    projects: [proj("p1", "c-ann"), proj("p2", "c-ann")],
    inbox_emails: [inboxRow("e1", "c-ann", null), inboxRow("e2", "c-bob", null), inboxRow("e3", null, null), inboxRow("e4", "c-ann", "p1")],
  });
  const list = await loadContactConversations(db, "c-ann");
  assert.deepEqual(list.map((c) => c.href).sort(), ["/inbox?e=e1", "/inbox?e=e4"]);
});

test("conversations group by thread, count each message once, and show the newest as the entry point", () => {
  const rows = [
    { id: "a", direction: "inbound" as const, subject: "Quote", received_at: "2026-10-01T10:00:00Z", provider_thread_id: "T", status: "handled" },
    { id: "b", direction: "outbound" as const, subject: "Re: Quote", received_at: "2026-10-02T10:00:00Z", provider_thread_id: "T", status: "handled" },
    { id: "b", direction: "outbound" as const, subject: "Re: Quote", received_at: "2026-10-02T10:00:00Z", provider_thread_id: "T", status: "handled" },
    { id: "c", direction: "inbound" as const, subject: "", received_at: "2026-10-03T10:00:00Z", provider_thread_id: null, status: "open" },
  ];
  const g = groupConversations(rows);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => [x.emailId, x.messages, x.subject, x.needsAttention]), [["c", 1, "(no subject)", true], ["b", 2, "Re: Quote", false]]);
});

// ---- Reply-To ----

test("Reply-To comes only from the INBOX_ADDRESS setting, normalised; nothing is invented", () => {
  assert.equal(replyToAddress({ INBOX_ADDRESS: " Shared.Inbox@Example.com " }), "shared.inbox@example.com");
  const quiet = console.warn;
  const warnings: string[] = [];
  console.warn = (m: string) => void warnings.push(m);
  try {
    assert.equal(replyToAddress({}), undefined);
    assert.equal(replyToAddress({ INBOX_ADDRESS: "   " }), undefined);
    assert.equal(replyToAddress({ INBOX_ADDRESS: "not an address" }), undefined);
  } finally {
    console.warn = quiet;
  }
  assert.ok(warnings.length <= 1, "the warning is logged once, not on every email");
  assert.equal(replyToConfigured({}), false);
  assert.equal(replyToConfigured({ INBOX_ADDRESS: "a@b.co" }), true);
});

const realFetch = globalThis.fetch;
const saved = { ...process.env };
let payloads: Row[] = [];
beforeEach(() => {
  payloads = [];
  Object.assign(process.env, { RESEND_API_KEY: "test-key", EMAIL_FROM: "Smith Bros <noreply@example.test>" });
  globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
    payloads.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "prov-1" }), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
});

const send = (replyTo?: string) => {
  const { db } = fakeDb({ settings: [{ key: "demo_mode", value: { enabled: false, recipient_allowlist: [] } }] });
  return sendRecordedEmail({ db, contactId: "c-ann", projectId: "p1", to: "ann@example.com", mail: { subject: "S", html: "<p>x</p>", text: "x" }, idempotencyKey: `k-${payloads.length}`, ...(replyTo ? { replyTo } : {}) });
};

test("outgoing email gets the configured inbox as Reply-To", async () => {
  process.env.INBOX_ADDRESS = "shared@example.com";
  assert.equal((await send()).status, "sent");
  assert.equal(payloads[0].reply_to, "shared@example.com");
});

test("missing or invalid INBOX_ADDRESS blocks customer email: nothing is recorded, delivered or reported as sent", async () => {
  const quiet = console.warn;
  console.warn = () => {};
  try {
    for (const value of [undefined, "", "   ", "not an address"]) {
      if (value === undefined) delete process.env.INBOX_ADDRESS;
      else process.env.INBOX_ADDRESS = value;
      const seed = fakeDb({ settings: [{ key: "demo_mode", value: { enabled: false, recipient_allowlist: [] } }] });
      const r = await sendRecordedEmail({ db: seed.db, contactId: "c-ann", projectId: "p1", to: "ann@example.com", mail: { subject: "S", html: "x", text: "x" }, idempotencyKey: "k" });
      assert.deepEqual(r, { status: "failed", code: "reply_to_not_configured" }, String(value));
      assert.equal(seed.t.conversations.length + seed.t.messages.length + seed.t.message_deliveries.length, 0, "nothing written");
      assert.equal(customerEmailReady(), false);
    }
  } finally {
    console.warn = quiet;
  }
  assert.equal(payloads.length, 0, "the provider was never called");
});

test("demo-mode restrictions still apply, and are reported as skipped, with or without INBOX_ADDRESS", async () => {
  for (const inbox of ["shared@example.com", undefined]) {
    if (inbox) process.env.INBOX_ADDRESS = inbox;
    else delete process.env.INBOX_ADDRESS;
    const seed = fakeDb({ settings: [{ key: "demo_mode", value: { enabled: true, recipient_allowlist: ["someone.else@example.com"] } }] });
    const quiet = console.warn;
    console.warn = () => {};
    try {
      const r = await sendRecordedEmail({ db: seed.db, contactId: "c-ann", projectId: "p1", to: "ann@example.com", mail: { subject: "S", html: "x", text: "x" }, idempotencyKey: "k" });
      assert.equal(r.status, "skipped");
    } finally {
      console.warn = quiet;
    }
  }
  assert.equal(payloads.length, 0);
});

test("customer email is ready only with sending enabled AND a valid inbox address; agreements list the inbox as a blocker", () => {
  process.env.EMAIL_SENDING_ENABLED = "true";
  process.env.INBOX_ADDRESS = "shared@example.com";
  assert.equal(customerEmailReady(), true);
  assert.equal(sendBlockers(["Approved contract"]).length, 0);
  delete process.env.INBOX_ADDRESS;
  const quiet = console.warn;
  console.warn = () => {};
  try {
    assert.equal(customerEmailReady(), false);
  } finally {
    console.warn = quiet;
  }
  assert.ok(sendBlockers(["Approved contract"]).some((b) => /INBOX_ADDRESS/.test(b)));
  process.env.EMAIL_SENDING_ENABLED = "false";
  process.env.INBOX_ADDRESS = "shared@example.com";
  assert.equal(customerEmailReady(), false);
});

test("every sender of customer email (leads, consultations, estimates, agreements) sets Reply-To through the shared helper", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const f of ["app/(app)/leads/[id]/actions.ts", "app/(app)/leads/[id]/email/actions.ts", "lib/leads/estimate-send.ts", "lib/agreements/send.ts"]) {
    const src = read(f);
    assert.match(src, /replyTo: replyToAddress\(\)/, f);
    assert.doesNotMatch(src, /process\.env\.INBOX_ADDRESS/, f);
  }
  assert.match(read("lib/email/record.ts"), /a\.replyTo \?\? replyToAddress\(\)[\s\S]*reply_to_not_configured/);
  // Internal staff alerts are untouched: they do not invite a reply and do not go through the customer path.
  assert.doesNotMatch(read("lib/leads/notify.ts"), /replyToAddress|customerEmailReady|INBOX_ADDRESS/);
});

// ---- Access control ----

test("Inbox reads and writes are admin-only on the server: actions require an admin, the attachment route uses row security, and the table is admin-read-only", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const actions = read("app/(app)/inbox/actions.ts");
  // Each exported action calls requireAdmin before anything else (getThread and followUp only delegate to actions that do).
  const chunks = actions.split("export async function ").slice(1).filter((c) => !c.startsWith("getThread") && !c.startsWith("followUp"));
  assert.ok(chunks.length >= 8);
  for (const c of chunks) assert.match(c.slice(c.indexOf("{"), c.indexOf("{") + 120), /await requireAdmin\(\)/, c.slice(0, 30));

  const attach = read("app/api/inbox/attachments/[id]/route.ts");
  assert.match(attach, /await createClient\(\)\)\s*\.from\("inbox_attachments"\)/);
  assert.match(attach, /if \(!a \|\| !a\.storage_path\) return new NextResponse\("Not found"/);

  // The new conversation lists read through the signed-in user's client; they never import the full-access client.
  assert.doesNotMatch(read("lib/inbox/links.ts"), /createAdminClient/);
  assert.doesNotMatch(read("app/(app)/conversation-list.tsx"), /createAdminClient/);

  const sql = readFileSync(new URL("../../../../../supabase/migrations/20261019130000_inbox_emails.sql", import.meta.url), "utf8");
  assert.match(sql, /grant select on public\.inbox_emails to authenticated/);
  assert.match(sql, /using \(\(select private\.is_active_admin\(\)\)\)/);
});

test("the conversation lists return nothing when row security hides the mail (a non-admin client)", async () => {
  const blind = { from: () => { const b: any = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, then: (r: any) => r({ data: [], error: null }) }; return b; } } as unknown as SupabaseClient;
  assert.deepEqual(await loadContactConversations(blind, "c-ann"), []);
});
