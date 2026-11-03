import "server-only";
import { askCopilot } from "./gemini";
import { askKananaCopilot, kananaFallback, type CopilotProviderResult } from "./kanana";
import { parseCompanionResponse } from "../companion/episodeSummarizer";
import { sanitizeAiResponse } from "./sanitizeResponse";

export async function generateCopilotReply(...args: Parameters<typeof askCopilot>) {
  const provider = process.env.COPILOT_AI_PROVIDER?.trim() || "gemini";
  let result: CopilotProviderResult;
  if (provider === "kanana") {
    result = await askKananaCopilot(args[0], args[1], args[2], args[3], args[5]);
  } else if (provider === "gemini") {
    const reply = await askCopilot(...args);
    result = { ...reply, providerUsed: reply.aiUsed ? "gemini_cloud" : "local_rules" };
  } else {
    result = kananaFallback(args[0], args[1], args[2], args[3], args[5]);
  }
  const parsed = parseCompanionResponse(result.answer);
  return { ...result, answer: sanitizeAiResponse(parsed.message || result.answer),
    narration: parsed.narration, suggestions: parsed.suggestions };
}
