// 수동 내보내기 — 오늘의 LLM 산출물을 Obsidian 다이제스트 노트로 (phase6 §8, §10)

import { NextResponse } from "next/server";
import { LlmArtifactAdapter } from "@/lib/adapters/llmArtifact";
import { ObsidianAdapter } from "@/lib/adapters/obsidian";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST() {
  const session = await readSession();
  if (!session) return unauthorized();

  if (!session.obsidianVaultPath) {
    return NextResponse.json({ error: "Obsidian 볼트 연동이 필요합니다" }, { status: 400 });
  }
  if (!session.llmArtifactsPath) {
    return NextResponse.json({ error: "LLM 산출물 폴더 연동이 필요합니다" }, { status: 400 });
  }

  try {
    const items = await new LlmArtifactAdapter(session.llmArtifactsPath).fetchArtifacts({
      todayOnly: true,
    });
    if (items.length === 0) {
      return NextResponse.json({ success: true, message: "오늘은 내보낼 LLM 산출물이 없네요" });
    }
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const written = await ObsidianAdapter.writeLlmDigest(
      session.obsidianVaultPath,
      dateKey,
      items
    );
    return NextResponse.json({
      success: true,
      message: written
        ? `coffeTide_LLM/${dateKey}.md에 ${items.length}건 정리해뒀어요`
        : "이미 최신이에요 — 손댈 게 없었어요",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "다이제스트 기록 실패" },
      { status: 500 }
    );
  }
}
