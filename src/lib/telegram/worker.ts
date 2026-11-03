import "server-only";
import type { ConversationHistoryTurn } from "@/lib/ai/conversation";
import { routeConversation } from "@/lib/ai/conversation";
import { generateCopilotReply } from "@/lib/ai/copilotService";
import { createAiJob, getAiJob, saveAiJob } from "@/lib/ai/jobs/store";
import { finishAiJob } from "@/lib/ai/jobs/server";
import type { AiJob } from "@/lib/ai/jobs/types";
import { mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { filterItemsByExecutionPolicy } from "@/lib/knowledge/policy";
import { telegramConfig } from "./config";
import { checkpoint, stillLinked, telegramDb, type TelegramEvent } from "./store";
import { sendTelegram, TelegramSendError } from "./sender";

export async function telegramAnswer(event: TelegramEvent): Promise<Response> {
  const db = telegramDb();
  const route = routeConversation({ text: event.question });
  const { data: turns, error: historyError } = await db.from("telegram_events").select("question,reply")
    .eq("link_id", event.link_id).eq("status", "sent").gt("created_at", new Date(Date.now() - 86400_000).toISOString())
    .order("created_at", { ascending: false }).limit(4);
  if (historyError) { throw new Error("Telegram history unavailable"); }
  const history: ConversationHistoryTurn[] = (turns ?? []).reverse().flatMap((turn) => [
    { role: "user", text: String(turn.question).slice(0, 500) },
    { role: "assistant", text: String(turn.reply).slice(0, 500) },
  ]);
  let items: ReturnType<typeof mapUnifiedItemFromDb>[] = [];
  if (route.needsWorkContext) {
    const { data, error } = await db.from("unified_items").select("*").eq("user_id", event.user_id)
      .eq("ai_policy", "cloud_allowed").neq("privacy_scope", "local_only").is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(80);
    if (error) { throw new Error("Telegram workspace data unavailable"); }
    items = filterItemsByExecutionPolicy((data ?? []).map(mapUnifiedItemFromDb), "cloud_allowed").allowed;
  }
  const result = await generateCopilotReply(event.question, items, "Asia/Seoul", undefined, undefined, {
    mode: route.mode, history, allowCloudTools: false,
    companionContext: "현재 채널은 Telegram 읽기 전용 대화입니다. 자료 조회와 텍스트 초안만 제공합니다. 일정 등록, 메일 발송, 변경, 삭제, 앱 실행을 수행하지 않으며 완료했다고 주장하지 마세요. 실행 요청은 CoffeeTide 웹에서 진행하도록 안내하세요. 제공된 서버 자료 밖의 PC 파일이나 최신 외부 연동 상태를 확인했다고 말하지 마세요.",
  });
  return Response.json({ answer: result.answer, ai_fallback: !result.aiUsed,
    providerUsed: result.providerUsed, ai_error_code: result.fallbackReason, context_limited: result.contextLimited,
    dataSource: route.needsWorkContext ? "synced_server_items" : "conversation_only" });
}

export async function processTelegramEvent(event: TelegramEvent): Promise<void> {
  try {
    if (!await stillLinked(event)) { return; }
    let reply = event.reply;
    if (!reply) {
      let job = await getAiJob(event.job_id, event.user_id);
      if (!job) {
        const fresh: AiJob = { id: event.job_id, ownerId: event.user_id, kind: "copilot", question: event.question,
          createdAt: Date.now(), status: "running", notification: "disabled" };
        if (!await createAiJob(fresh)) { throw new Error("Telegram job already exists"); }
        await finishAiJob(fresh, undefined, () => telegramAnswer(event));
        job = fresh;
      } else if (job.status === "running") {
        job.status = "failed";
        job.httpStatus = 504;
        job.result = { error: "이전 실행의 결과를 확인하지 못했습니다. 다시 질문해 주세요." };
        await saveAiJob(job);
      }
      const config = telegramConfig();
      if (!config) { throw new Error("Telegram configuration unavailable"); }
      const answer = typeof job.result?.answer === "string" ? job.result.answer : "AI 작업을 완료하지 못했습니다. 웹에서 결과를 확인해 주세요.";
      const label = job.status === "failed" ? "작업 실패"
        : job.result?.ai_fallback === true ? "AI를 사용할 수 없어 준비한 대체 응답" : "작업 완료";
      reply = `${label}\n${answer.slice(0, 3000)}\n\n외부 서비스 변경은 실행하지 않았습니다.\n웹에서 확인: ${config.origin}/?aiJob=${job.id}`;
      if (!await checkpoint(event, { reply, status: "ready" })) { return; }
    }
    if (!await stillLinked(event)) { return; }
    if (!await checkpoint(event, { status: "ready" })) { return; }
    await sendTelegram(event.chat_id, reply);
    await checkpoint(event, { status: "sent", lease_until: null });
  } catch (error) {
    if (error instanceof TelegramSendError && error.blocked) {
      const { error: unlinkError } = await telegramDb().from("telegram_links").delete()
        .eq("id", event.link_id).eq("user_id", event.user_id);
      if (unlinkError) { throw new Error("Telegram blocked link cleanup failed"); }
      return;
    }
    await checkpoint(event, { lease_until: new Date().toISOString() });
    throw new Error("Telegram work or delivery failed");
  }
}
