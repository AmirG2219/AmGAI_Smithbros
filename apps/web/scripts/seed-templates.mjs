// Uploads agreement template versions to the private bucket, approves them, and retires the previous version.
// Run from apps/web:  node --env-file=.env.local scripts/seed-templates.mjs
// Safe to re-run. To publish new wording, add a new file and bump `version` below (never edit an approved one).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const templates = [
  {
    type: "work_contract",
    name: "Work Contract (placeholder)",
    version: 2,
    file: "templates/work_contract.v2.md",
    variables: [
      "company_name", "contract_date", "client_name", "client_email", "client_phone", "site_address",
      "scope_of_work", "exclusions", "subtotal", "tax", "total", "deposit_percent", "deposit_amount",
      "balance_amount", "payment_terms", "start_date", "completion_estimate",
    ],
  },
  {
    type: "policy_liability",
    name: "Policy and Liability Agreement (placeholder)",
    version: 2,
    file: "templates/policy_liability.v2.md",
    variables: ["company_name", "contract_date", "client_name", "site_address"],
  },
];

const { data: admin, error: adminErr } = await db
  .from("app_users").select("id").eq("role", "admin").eq("is_active", true).limit(1).single();
if (adminErr) throw adminErr;

for (const t of templates) {
  const bytes = readFileSync(t.file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = `templates/${t.type}/v${t.version}.md`;

  let { data: tpl } = await db.from("agreement_templates").select("id").eq("document_type", t.type).eq("is_active", true).maybeSingle();
  if (!tpl) {
    const r = await db.from("agreement_templates").insert({ document_type: t.type, name: t.name }).select("id").single();
    if (r.error) throw r.error;
    tpl = r.data;
  }

  let { data: ver } = await db.from("agreement_template_versions").select("id, status, created_at").eq("template_id", tpl.id).eq("version_number", t.version).maybeSingle();
  if (ver?.status === "approved") { console.log(`${t.type}: v${t.version} already approved`); continue; }

  if (!ver) {
    const up = await db.storage.from("agreements").upload(path, bytes, { contentType: "text/markdown", upsert: false });
    if (up.error && !String(up.error.message).includes("already exists")) throw up.error;

    const v = await db.from("agreement_template_versions").insert({
      template_id: tpl.id, document_type: t.type, version_number: t.version, status: "draft",
      template_storage_path: path, template_sha256: sha, variable_schema: { variables: t.variables },
    }).select("id, status, created_at").single();
    if (v.error) throw v.error;
    ver = v.data;
  }

  // Only one version per template may be approved: retire the current one first.
  const retire = await db.from("agreement_template_versions")
    .update({ status: "retired" }).eq("template_id", tpl.id).eq("status", "approved");
  if (retire.error) throw retire.error;

  // This computer's clock can differ slightly from the database's, and approval must not predate creation.
  const approvedAt = new Date(Math.max(Date.now(), new Date(ver.created_at).getTime() + 1000)).toISOString();
  const ap = await db.from("agreement_template_versions")
    .update({ status: "approved", approved_by: admin.id, approved_at: approvedAt })
    .eq("id", ver.id);
  if (ap.error) throw ap.error;
  console.log(`${t.type}: v${t.version} uploaded and approved (previous retired)`);
}
