import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { aiEnabled } from "@/lib/campaigns/ai";
import {
  FILTER_OPTIONS,
  checkEligibility,
  findCandidates,
  parseFilter,
} from "@/lib/campaigns/audience";
import { buildCampaignEmail, mergeFields } from "@/lib/campaigns/email";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../../ui";
import { createCampaign, draftWithAi } from "../actions";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : (v ?? ""));
const list = (v: string | string[] | undefined) => one(v).split(",").filter(Boolean);

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";
const pretty = (s: string) => s.replaceAll("_", " ");

const errors: Record<string, string> = {
  missing: "Fill in the name, goal, subject and message.",
  "no-recipients": "Nobody in that audience has current marketing consent, so there is nobody to email.",
  ai: "Claude couldn't draft this just now. You can write it yourself below.",
};

function Checks({ name, options, selected }: { name: string; options: readonly string[]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-1.5 text-sm capitalize">
          <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} />
          {pretty(o)}
        </label>
      ))}
    </div>
  );
}

export default async function NewCampaign({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = {
    name: one(sp.name),
    instruction: one(sp.instruction),
    subject: one(sp.subject),
    body: one(sp.body),
    inactive: one(sp.inactive_months),
    types: list(sp.project_types),
    materials: list(sp.materials),
    stages: list(sp.stages),
  };

  let preview: null | {
    matched: number;
    eligible: number;
    noConsent: number;
    suppressed: number;
    sample: { subject: string; text: string } | null;
  } = null;

  if (sp.preview && v.subject && v.body) {
    const db = await createClient(); // as the signed-in admin: read-only
    const filter = parseFilter({
      project_types: v.types,
      materials: v.materials,
      stages: v.stages,
      inactive_months: v.inactive,
    });
    const candidates = await findCandidates(db, filter);
    const e = await checkEligibility(db, candidates);
    const first = e.eligible[0];
    preview = {
      matched: candidates.length,
      eligible: e.eligible.length,
      noConsent: e.noConsent,
      suppressed: e.suppressed,
      sample: first
        ? {
            subject: mergeFields(v.subject, first),
            text: buildCampaignEmail({
              subject: v.subject,
              body: mergeFields(v.body, first),
              recipientId: "00000000-0000-0000-0000-000000000000",
            }).mail.text,
          }
        : null,
    };
  }

  const ai = aiEnabled();

  return (
    <div>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> All campaigns
      </Link>
      <PageHeader eyebrow="System 2" title="New campaign" />
      <p className="-mt-3 mb-5 max-w-3xl text-sm text-muted">
        Fill in the three parts below, then press Preview. You&apos;ll see who would receive it and a sample email.
        Nothing is saved or sent until you create the draft, and nothing goes out until it&apos;s approved.
      </p>

      {typeof sp.error === "string" && errors[sp.error] && (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errors[sp.error]}
        </p>
      )}

      <div className="grid max-w-3xl gap-5">
        {ai ? (
          <Card className="p-5">
            <p className="eyebrow mb-2">Draft with Claude</p>
            <form action={draftWithAi} className="grid gap-3">
              <textarea
                name="instruction"
                rows={2}
                defaultValue={v.instruction}
                placeholder="e.g. Reconnect with customers who had hardwood installed more than 2 years ago and offer a free floor check."
                className={input}
              />
              <button className="inline-flex w-fit items-center gap-2 rounded-lg border border-bronze px-4 py-2 text-sm text-bronze hover:bg-bronze hover:text-cream">
                <Sparkles size={15} /> Draft campaign
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">Claude fills in the form below. You review and edit everything before anything is saved or sent.</p>
          </Card>
        ) : (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
            AI drafting is off until an Anthropic API key is added. You can write the campaign yourself below.
          </p>
        )}

        <form method="get" className="grid gap-5">
          <Card className="p-5">
            <p className="eyebrow mb-3">1. What is this campaign for?</p>
            <div className="grid gap-3">
              <div>
                <label className={label} htmlFor="name">Campaign name</label>
                <input id="name" name="name" defaultValue={v.name} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="instruction">What is this campaign for?</label>
                <textarea id="instruction" name="instruction" rows={2} defaultValue={v.instruction} className={input} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-1">2. Who should get it?</p>
            <p className="mb-3 text-xs text-muted">Tick the groups to include. Leave a group empty to not filter by it. Whatever you choose, only people who have given permission to receive marketing email are included.</p>
            <div className="grid gap-4">
              <div>
                <p className={label}>Project type</p>
                <Checks name="project_types" options={FILTER_OPTIONS.project_types} selected={v.types} />
              </div>
              <div>
                <p className={label}>Material</p>
                <Checks name="materials" options={FILTER_OPTIONS.materials} selected={v.materials} />
              </div>
              <div>
                <p className={label}>Stage</p>
                <Checks name="stages" options={FILTER_OPTIONS.stages} selected={v.stages} />
              </div>
              <div className="max-w-xs">
                <label className={label} htmlFor="inactive_months">Last project older than (months)</label>
                <input id="inactive_months" name="inactive_months" type="number" min="1" defaultValue={v.inactive} className={input} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow mb-1">3. What should the email say?</p>
            <p className="mb-3 text-xs text-muted">
              Use {"{{first_name}}"} to greet each person. The unsubscribe link and company details are added automatically.
            </p>
            <div className="grid gap-3">
              <div>
                <label className={label} htmlFor="subject">Subject</label>
                <input id="subject" name="subject" defaultValue={v.subject} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="body">Message</label>
                <textarea id="body" name="body" rows={8} defaultValue={v.body} className={input} />
              </div>
            </div>
          </Card>

          <button name="preview" value="1" className="w-fit rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze">
            Preview audience and email
          </button>
        </form>

        {preview && (
          <Card className="border-bronze p-5">
            <p className="eyebrow mb-3">Preview (nothing is saved yet)</p>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="font-serif text-3xl">{preview.matched}</p><p className="text-muted">match your choices</p></div>
              <div><p className="font-serif text-3xl">{preview.eligible}</p><p className="text-muted">will be emailed</p></div>
              <div><p className="font-serif text-3xl">{preview.noConsent}</p><p className="text-muted">left out: no permission on file</p></div>
              <div><p className="font-serif text-3xl">{preview.suppressed}</p><p className="text-muted">left out: unsubscribed</p></div>
            </div>
            {preview.sample ? (
              <>
                <p className="mb-1 text-xs uppercase tracking-[0.15em] text-muted">Sample email</p>
                <div className="mb-4 rounded-lg border border-line bg-white p-4 text-sm">
                  <p className="mb-2 font-medium">{preview.sample.subject}</p>
                  <pre className="whitespace-pre-wrap font-sans">{preview.sample.text}</pre>
                </div>
                <form action={createCampaign}>
                  <input type="hidden" name="name" value={v.name} />
                  <input type="hidden" name="instruction" value={v.instruction} />
                  <input type="hidden" name="subject" value={v.subject} />
                  <input type="hidden" name="body" value={v.body} />
                  <input type="hidden" name="project_types" value={v.types.join(",")} />
                  <input type="hidden" name="materials" value={v.materials.join(",")} />
                  <input type="hidden" name="stages" value={v.stages.join(",")} />
                  <input type="hidden" name="inactive_months" value={v.inactive} />
                  <button className="rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze">
                    Create campaign draft ({preview.eligible} recipients)
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-bronze">
                Nobody in this audience has current marketing consent. Record consent on the Contacts page first.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
