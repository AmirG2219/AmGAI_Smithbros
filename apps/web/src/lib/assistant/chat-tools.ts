import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrRefreshDraft } from "./drafts";

// What the chat assistant may do. Everything here only READS our records, except draft_reply, which creates a
// draft that a human must still approve on the email page. There is deliberately no tool that sends, books or edits.

export const TOOLS = [
  {
    name: "list_waiting",
    description: "List open emails that need attention, most urgent first. Use for 'what needs my attention' questions.",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "Max results, default 10" } } },
  },
  {
    name: "search_emails",
    description: "Search emails by words in the subject, body or sender address.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["open", "handled", "all"] },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_email_thread",
    description: "Read the whole conversation an email belongs to, plus any draft reply waiting.",
    input_schema: { type: "object", properties: { email_id: { type: "string" } }, required: ["email_id"] },
  },
  {
    name: "list_leads",
    description: "List leads, newest first. Filter by pipeline stage, rating, or those with no consultation booked.",
    input_schema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["new", "estimate_sent", "consultation_booked", "site_visit_completed", "final_quote_sent", "customer_accepted", "agreement_sent", "won", "lost"] },
        rating: { type: "string", enum: ["hot", "warm", "cold"] },
        no_consultation: { type: "boolean" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "get_lead",
    description: "Full details of one lead: contact, project, estimate, consultation and recent timeline.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] },
  },
  {
    name: "draft_reply",
    description: "Write a reply DRAFT for an email. It is only saved as a draft for the owner to review and approve; it is never sent.",
    input_schema: {
      type: "object",
      properties: { email_id: { type: "string" }, instruction: { type: "string", description: "What the reply should say or do" } },
      required: ["email_id"],
    },
  },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clamp = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? s.slice(0, n) + "…" : (s ?? ""));
// Text that came from outside the company is fenced, so the model can tell it apart from our own records.
const untrusted = (s: string | null | undefined, n: number) => `<untrusted_email>${clip(s, n)}</untrusted_email>`;
const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
type Est = { status: string; price_min: number | null; price_max: number | null; revision_number: number; pricing_snapshot: { is_placeholder?: boolean } | null };
const estimateOf = (list: Est[] | null) => {
  const e = [...(list ?? [])].filter((x) => x.status !== "cancelled").sort((a, b) => b.revision_number - a.revision_number)[0];
  if (!e) return null;
  if (e.price_min === null || e.price_max === null) return { text: "needs a manual quote", status: e.status };
  return { text: `${money(e.price_min)} to ${money(e.price_max)}${e.pricing_snapshot?.is_placeholder ? " (sample pricing)" : ""}`, status: e.status };
};

export async function runTool(db: SupabaseClient, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "list_waiting": {
      const { data } = await db
        .from("inbox_emails")
        .select("id, from_name, from_address, subject, priority, needs_reply, summary, received_at, contact_id, project_id, email_drafts(status)")
        .eq("direction", "inbound")
        .eq("status", "open")
        .order("received_at", { ascending: false })
        .limit(60);
      const rows = (data ?? [])
        .filter((e) => e.needs_reply !== false)
        .sort((a, b) => (rank[a.priority ?? "normal"] ?? 2) - (rank[b.priority ?? "normal"] ?? 2))
        .slice(0, clamp(input.limit, 1, 25, 10));
      return rows.map((e) => ({
        id: e.id,
        link: `/inbox/${e.id}`,
        from: untrusted(e.from_name ?? e.from_address, 80),
        subject: untrusted(e.subject, 120),
        priority: e.priority ?? "not rated",
        summary: untrusted(e.summary, 300),
        received: e.received_at,
        known_customer: !!e.contact_id,
        draft_waiting: (e.email_drafts as { status: string }[] | null)?.some((d) => ["draft", "approved", "failed"].includes(d.status)) ?? false,
      }));
    }

    case "search_emails": {
      const q = String(input.query ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
      if (!q) return { error: "Give a search word." };
      let query = db
        .from("inbox_emails")
        .select("id, from_name, from_address, subject, body_text, received_at, status, direction")
        .or(`subject.ilike.%${q}%,body_text.ilike.%${q}%,from_address.ilike.%${q}%`)
        .order("received_at", { ascending: false })
        .limit(clamp(input.limit, 1, 15, 8));
      if (input.status === "open" || input.status === "handled") query = query.eq("status", input.status);
      const { data } = await query;
      return (data ?? []).map((e) => ({
        id: e.id,
        link: `/inbox/${e.id}`,
        direction: e.direction,
        from: untrusted(e.from_name ?? e.from_address, 80),
        subject: untrusted(e.subject, 120),
        snippet: untrusted(e.body_text, 200),
        received: e.received_at,
        status: e.status,
      }));
    }

    case "get_email_thread": {
      const id = String(input.email_id ?? "");
      if (!UUID.test(id)) return { error: "That is not a valid email id." };
      const { data: e } = await db.from("inbox_emails").select("id, provider_thread_id, subject, contact_id, project_id").eq("id", id).maybeSingle();
      if (!e) return { error: "Email not found." };
      const { data: msgs } = e.provider_thread_id
        ? await db.from("inbox_emails").select("direction, from_name, from_address, body_text, received_at").eq("provider_thread_id", e.provider_thread_id).order("received_at", { ascending: true }).limit(12)
        : await db.from("inbox_emails").select("direction, from_name, from_address, body_text, received_at").eq("id", id);
      const { data: drafts } = await db.from("email_drafts").select("status, subject, body_text, checks").eq("email_id", id).in("status", ["draft", "approved", "failed"]).limit(1);
      return {
        link: `/inbox/${id}`,
        lead_link: e.project_id ? `/leads/${e.project_id}` : null,
        messages: (msgs ?? []).map((m) => ({
          direction: m.direction,
          from: untrusted(m.from_name ?? m.from_address, 80),
          date: m.received_at,
          text: untrusted(m.body_text, 1500),
        })),
        draft_waiting: drafts?.[0] ? { status: drafts[0].status, subject: drafts[0].subject, body: clip(drafts[0].body_text, 600), checks: drafts[0].checks } : null,
      };
    }

    case "list_leads": {
      let q = db
        .from("projects")
        .select("id, stage, lead_classification, lead_score, project_type, square_footage, created_at, contacts(first_name, last_name), estimates(status, price_min, price_max, revision_number, pricing_snapshot), appointments(status)")
        .order("created_at", { ascending: false })
        .limit(60);
      if (typeof input.stage === "string") q = q.eq("stage", input.stage);
      if (typeof input.rating === "string") q = q.eq("lead_classification", input.rating);
      const { data } = await q;
      let rows = data ?? [];
      if (input.no_consultation === true)
        rows = rows.filter((p) => !(p.appointments as { status: string }[] | null)?.some((a) => a.status === "scheduled" || a.status === "completed"));
      return rows.slice(0, clamp(input.limit, 1, 25, 10)).map((p) => {
        const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
        return {
          id: p.id,
          link: `/leads/${p.id}`,
          name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
          stage: p.stage,
          rating: p.lead_classification ? `${p.lead_classification} (${p.lead_score})` : "unrated",
          project: [p.project_type, p.square_footage ? `${p.square_footage} sq ft` : null].filter(Boolean).join(", "),
          estimate: estimateOf(p.estimates as Est[] | null)?.text ?? "none",
          consultation_booked: !!(p.appointments as { status: string }[] | null)?.some((a) => a.status === "scheduled"),
          received: p.created_at,
        };
      });
    }

    case "get_lead": {
      const id = String(input.lead_id ?? "");
      if (!UUID.test(id)) return { error: "That is not a valid lead id." };
      const [{ data: p }, { data: events }] = await Promise.all([
        db.from("projects").select("id, stage, project_type, material_preference, square_footage, timeline_preference, site_city, lead_classification, lead_score, review_reason, additional_answers, created_at, contacts(first_name, last_name, email, phone), estimates(status, price_min, price_max, revision_number, pricing_snapshot), appointments(status, start_at)").eq("id", id).maybeSingle(),
        db.from("events").select("summary, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(10),
      ]);
      if (!p) return { error: "Lead not found." };
      const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
      const a = (p.additional_answers ?? {}) as { notes?: string; rooms?: string[]; species?: string[]; pattern?: string; finish?: string; preferred_contact?: string };
      return {
        link: `/leads/${id}`,
        name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
        email: c?.email,
        phone: c?.phone,
        stage: p.stage,
        rating: p.lead_classification ? `${p.lead_classification} (${p.lead_score})` : "unrated",
        review_reason: p.review_reason,
        project: { type: p.project_type, sqft: p.square_footage, timeline: p.timeline_preference, city: p.site_city, rooms: a.rooms, species: a.species, pattern: a.pattern, finish: a.finish, preferred_contact: a.preferred_contact },
        customer_notes: a.notes ? `<untrusted_customer_text>${clip(a.notes, 600)}</untrusted_customer_text>` : null,
        estimate: estimateOf(p.estimates as Est[] | null),
        consultations: (p.appointments as { status: string; start_at: string }[] | null) ?? [],
        recent_timeline: (events ?? []).map((e) => `${e.created_at}: ${e.summary}`),
      };
    }

    case "draft_reply": {
      const id = String(input.email_id ?? "");
      if (!UUID.test(id)) return { error: "That is not a valid email id." };
      try {
        await createOrRefreshDraft(db, id, typeof input.instruction === "string" ? input.instruction.slice(0, 500) : undefined);
      } catch {
        return { error: "Could not write the draft for that email." };
      }
      return { ok: true, note: "Draft saved. It has NOT been sent. The owner reviews, edits and approves it on the email page.", link: `/inbox/${id}` };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
