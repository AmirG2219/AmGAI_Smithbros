// Checks the OpenAI connection end to end with two tiny calls. Run after adding the key:
//   npm --prefix apps/web run ai:check
import { aiEnabled, aiFastModel, aiModel, structured } from "@/lib/ai/llm";

async function main() {
  if (!aiEnabled()) {
    console.log("No OPENAI_API_KEY found in apps/web/.env.local. Add it, then run this again.");
    process.exit(1);
  }
  console.log(`Writing model: ${aiModel()}   Sorting model: ${aiFastModel()}\n`);

  let failed = false;
  for (const [label, model] of [
    ["Writing model", aiModel()],
    ["Sorting model", aiFastModel()],
  ] as const) {
    const t = Date.now();
    try {
      const { input } = await structured({
        system: "You are a connection test. Answer by calling the function.",
        user: "Reply with ok set to true.",
        model,
        maxTokens: 300,
        timeoutMs: 30_000,
        tool: {
          name: "report",
          description: "Report the test result.",
          input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        },
      });
      console.log(`${input.ok === true ? "PASS" : "WARN"}  ${label} (${model}) answered in ${Date.now() - t} ms`);
    } catch (e) {
      failed = true;
      console.log(`FAIL  ${label} (${model}): ${e instanceof Error ? e.message : e}`);
      console.log("      The OpenAI reason is printed above as [ai]. Common causes: wrong key, no credit, or a model name the key cannot use.");
    }
  }
  console.log(failed ? "\nNot ready. Fix the failure above." : "\nReady. Restart the dashboard so it picks up the key.");
  process.exit(failed ? 1 : 0);
}

main();
