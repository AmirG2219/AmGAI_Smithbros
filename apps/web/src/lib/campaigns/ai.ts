import { aiEnabled, structured } from "@/lib/ai/llm";
import { FILTER_OPTIONS, parseFilter, type AudienceFilter } from "./audience";

export { aiEnabled };

export type CampaignDraft = { name: string; subject: string; body: string; filter: AudienceFilter };

// Asks the AI to turn a staff instruction into a draft: an audience filter plus one email template.
// The reply is forced into a tool call, then re-validated here. Staff always review before anything sends.
export async function draftCampaign(instruction: string): Promise<CampaignDraft> {
  const { input } = await structured({
    system:
      "You help Smith Bros Floors, a flooring company in Calgary, Alberta, write marketing emails to past customers and leads. " +
      "Write warm, honest, professional copy. Never invent discounts, prices, guarantees or deadlines that the instruction does not state. " +
      "Use {{first_name}} to greet the reader. Do not include an unsubscribe link or company address; the system adds them. " +
      "Keep the email under 150 words.",
    user: instruction,
    maxTokens: 2500,
    timeoutMs: 45_000,
    tool: {
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
  });

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const draft = {
    name: str(input.name, 120),
    subject: str(input.subject, 200),
    body: str(input.body, 4000),
    filter: parseFilter(input),
  };
  if (!draft.subject || !draft.body) throw new Error("The AI's draft was incomplete");
  return draft;
}
