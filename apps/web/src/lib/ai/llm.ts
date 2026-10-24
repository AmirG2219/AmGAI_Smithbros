// The one place the app talks to the AI provider (OpenAI). Everything else asks for "a structured answer"
// and never sees the provider's request format.

export const aiEnabled = () => !!process.env.OPENAI_API_KEY;

// Smart model for writing and chat; small, cheap model for sorting incoming mail.
export const aiModel = () => process.env.OPENAI_MODEL || "gpt-4.1";
export const aiFastModel = () => process.env.OPENAI_TRIAGE_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

const baseUrl = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");

export type ToolDef = { readonly name: string; readonly description: string; readonly input_schema: object };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Completion = { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[] };

const asTool = (t: ToolDef) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } });

async function complete(body: Record<string, unknown>, timeoutMs: number): Promise<Completion> {
  const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    // The provider's reason (wrong key, no credit, unknown model) goes to the server log, never to the browser.
    const detail = await res.text().catch(() => "");
    console.error(`[ai] OpenAI request failed (${res.status}):`, detail.slice(0, 400));
    throw new Error(`AI request failed (${res.status})`);
  }
  return (await res.json()) as Completion;
}

// Asks the model to answer by calling one named function, so the reply always has the shape we asked for.
// The caller still validates every field: never trust the shape.
export async function structured(args: {
  system: string;
  user: string;
  tool: ToolDef;
  model?: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<{ input: Record<string, unknown>; model: string }> {
  const model = args.model ?? aiModel();
  const json = await complete(
    {
      model,
      max_completion_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      tools: [asTool(args.tool)],
      tool_choice: { type: "function", function: { name: args.tool.name } },
    },
    args.timeoutMs ?? 60_000,
  );
  const raw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!raw) throw new Error("AI returned no answer");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { input: parsed as Record<string, unknown>, model };
  } catch {
    /* falls through */
  }
  throw new Error("AI returned an unreadable answer");
}
