import { FILTER_OPTIONS, parseFilter, type AudienceFilter } from "./audience";

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export type CampaignDraft = { name: string; subject: string; body: string; filter: AudienceFilter };

// Asks Claude to turn a staff instruction into a draft: an audience filter plus one email template.
// The reply is forced into a tool call, then re-validated here. Staff always review before anything sends.
export async function draftCampaign(instruction: string): Promise<CampaignDraft> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1200,
      system:
        "You help Smith Bros Floors, a flooring company in Calgary, Alberta, write marketing emails to past customers and leads. " +
        "Write warm, honest, professional copy. Never invent discounts, prices, guarantees or deadlines that the instruction does not state. " +
        "Use {{first_name}} to greet the reader. Do not include an unsubscribe link or company address; the system adds them. " +
        "Keep the email under 150 words.",
      tools: [
        {
          name: "propose_campaign",
          description: "Propose the audience and email for the campaign.",
          input_schema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short internal campaign name" },
              project_types: { type: "array", items: { type: "string", enum: FILTER_OPTIONS.project_types } },
              materials: { type: "array", items: { type: "string", enum: FILTER_OPTIONS.materials } },
              stages: { type: "array", items: { type: "string", enum: FILTER_OPTIONS.stages } },
              inactive_months: {
                type: ["integer", "null"],
                description: "Only contacts whose latest project is older than this many months, or null",
              },
              subject: { type: "string" },
              body: { type: "string", description: "Plain text, paragraphs separated by blank lines" },
            },
            required: ["name", "subject", "body"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "propose_campaign" },
      messages: [{ role: "user", content: instruction }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Claude request failed (${res.status})`);
  const json = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const input = json.content?.find((c) => c.type === "tool_use")?.input;
  if (!input) throw new Error("Claude returned no draft");

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const draft = {
    name: str(input.name, 120),
    subject: str(input.subject, 200),
    body: str(input.body, 4000),
    filter: parseFilter(input),
  };
  if (!draft.subject || !draft.body) throw new Error("Claude's draft was incomplete");
  return draft;
}
