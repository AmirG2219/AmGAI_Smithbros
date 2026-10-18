import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeEmail, triageEnabled } from "./analyze";

export type InboundEmail = {
  provider_message_id: string;
  provider_thread_id: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  subject: string;
  received_at: string;
  body_text: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Accepts "Name <a@b.com>" or a bare address.
function parseFrom(raw: string): { address: string; name: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  const address = (m ? m[2] : raw).trim().toLowerCase();
  const name = m ? m[1].trim() || null : null;
  return { address, name };
}

export function parseInbound(body: unknown): { ok: true; value: InboundEmail } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;

  const id = str(b.provider_message_id, 200);
  if (!id) return { ok: false, error: "provider_message_id is required" };

  let address = str(b.from_address, 320).toLowerCase();
  let name = str(b.from_name, 200) || null;
  if (!address && typeof b.from === "string") {
    const p = parseFrom(b.from);
    address = p.address;
    name = name ?? p.name;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: "A valid sender address is required" };

  const received = new Date(String(b.received_at ?? ""));
  const to = Array.isArray(b.to_addresses) ? b.to_addresses : typeof b.to === "string" ? [b.to] : [];

  return {
    ok: true,
    value: {
      provider_message_id: id,
      provider_thread_id: str(b.provider_thread_id, 200) || null,
      from_address: address,
      from_name: name,
      to_addresses: to.map((t) => parseFrom(String(t)).address).filter(Boolean).slice(0, 20),
      subject: str(b.subject, 500),
      received_at: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
      body_text: str(b.body_text ?? b.text, 50_000),
    },
  };
}

// Stores the email (once) and links it to a known contact and their latest project.
export async function storeInboundEmail(db: SupabaseClient, e: InboundEmail) {
  const { data: contact } = await db
    .from("contacts")
    .select("id, projects(id, created_at)")
    .eq("email_normalized", e.from_address)
    .maybeSingle();
  const projects = ((contact?.projects ?? []) as { id: string; created_at: string }[]).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const { data, error } = await db
    .from("inbox_emails")
    .insert({
      provider: "gmail",
      ...e,
      contact_id: contact?.id ?? null,
      project_id: contact && projects[0] ? projects[0].id : null,
      analysis_status: triageEnabled() ? "pending" : "skipped",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { id: null as string | null, duplicate: true }; // already stored
    throw error;
  }
  return { id: data.id as string, duplicate: false };
}

// Facts from our own database that help the model. Only trusted data goes here, never email content.
async function contextFor(db: SupabaseClient, contactId: string | null, projectId: string | null) {
  if (!contactId) return null;
  const { data: c } = await db.from("contacts").select("first_name, last_name").eq("id", contactId).single();
  const lines = [`Known contact: ${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()];
  if (projectId) {
    const { data: p } = await db
      .from("projects")
      .select("project_type, material_preference, square_footage, stage, lead_classification, estimates(price_min, price_max, status)")
      .eq("id", projectId)
      .single();
    if (p) {
      lines.push(`Project: ${[p.project_type, p.material_preference].filter(Boolean).join(", ")}${p.square_footage ? `, ${p.square_footage} sq ft` : ""}`);
      lines.push(`Stage: ${p.stage}${p.lead_classification ? `; lead rating ${p.lead_classification}` : ""}`);
      const est = ((p.estimates ?? []) as { price_min: number | null; price_max: number | null; status: string }[]).find(
        (x) => x.status === "sent" && x.price_min !== null,
      );
      if (est) lines.push(`Estimate emailed to them: $${est.price_min} to $${est.price_max} (ballpark)`);
    }
  }
  return lines.join("\n");
}

export async function analyzeStoredEmail(db: SupabaseClient, id: string) {
  if (!triageEnabled()) return; // stored as "skipped"; summaries are off until an OpenAI key is set
  const { data: e } = await db
    .from("inbox_emails")
    .select("id, from_address, from_name, subject, body_text, contact_id, project_id")
    .eq("id", id)
    .single();
  if (!e) return;

  try {
    const { triage, model } = await analyzeEmail({
      from: e.from_name ? `${e.from_name} <${e.from_address}>` : e.from_address,
      subject: e.subject,
      body: e.body_text,
      context: await contextFor(db, e.contact_id, e.project_id),
    });
    await db
      .from("inbox_emails")
      .update({
        analysis_status: "done",
        category: triage.category,
        priority: triage.priority,
        needs_reply: triage.needs_reply,
        summary: triage.summary,
        suggested_action: triage.suggested_action,
        analysis_model: model,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (err) {
    console.error("[inbox] analysis failed:", err);
    await db.from("inbox_emails").update({ analysis_status: "failed" }).eq("id", id);
  }
}
