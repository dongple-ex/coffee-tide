import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  mapAiArtifactToDbRow,
  mapContentAssetToDbRow,
  mapUnifiedItemFromDb,
  mapUnifiedItemToDbRow,
} from "@/lib/data/mappers";
import { buildContentAsset } from "@/lib/assets/service";
import { buildAiArtifact } from "@/lib/ai/artifacts";

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/aac",
]);

// Vercel Function 요청 본문 4.5MB 제한보다 낮게 유지합니다(멀티파트 오버헤드 포함).
const MAX_AUDIO_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 10 * 60;

function audioExtension(mimeType: string): string {
  const baseMime = mimeType.split(";")[0].toLowerCase();
  if (baseMime === "audio/mp4" || baseMime === "audio/x-m4a") return ".m4a";
  if (baseMime === "audio/mpeg" || baseMime === "audio/mp3") return ".mp3";
  if (baseMime === "audio/wav" || baseMime === "audio/x-wav") return ".wav";
  if (baseMime === "audio/ogg") return ".ogg";
  if (baseMime === "audio/aac") return ".aac";
  return ".webm";
}

export async function POST(req: NextRequest) {
  // 1. 인증 확인
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    const mode = String(formData.get("mode") || "dictation");
    const retainOriginal = formData.get("retainOriginal") === "true";
    const itemId = String(formData.get("itemId") || `voice-${Date.now()}`);
    const durationSeconds = Number(formData.get("durationSeconds") || 0);

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    // 2. 용량 검증 (413 Payload Too Large)
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "오디오 파일 크기가 배포 제한(4MB)을 초과했습니다." },
        { status: 413 }
      );
    }

    if (Number.isFinite(durationSeconds) && durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
      return NextResponse.json(
        { error: "음성 녹음은 최대 10분까지 전사할 수 있습니다." },
        { status: 413 }
      );
    }

    // 3. MIME 타입 검증 (415 Unsupported Media Type)
    const baseMime = file.type.split(";")[0].toLowerCase();
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_MIME_TYPES.has(baseMime)) {
      return NextResponse.json(
        { error: `지원하지 않는 오디오 형식입니다: ${file.type}` },
        { status: 415 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI 전사 서비스를 현재 사용할 수 없습니다." },
        { status: 503 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    const mimeType = file.type || "audio/webm";

    const promptText =
      mode === "meeting"
        ? "이 회의 오디오를 한국어로 정확하게 전사(음성 인식)해 주세요. 참석자들의 발언을 자연스럽게 텍스트로 풀어주세요. 부가적인 설명 없이 전사 결과 텍스트만 출력하세요."
        : "이 음성을 한국어로 정확하게 전사(STT)해 주세요. 말한 문장 그대로 텍스트만 출력하세요.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Audio,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      // 보안: 내부 API 키나 원문 오류 내용을 외부에 노출하지 않음
      return NextResponse.json(
        { error: "음성 인식 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }

    const geminiData = await res.json();
    const transcript =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!transcript) {
      return NextResponse.json({ error: "음성에서 텍스트를 확인하지 못했습니다." }, { status: 422 });
    }

    let createdAssetId: string | undefined = undefined;
    let createdArtifactId: string | undefined = undefined;
    let savedItem: ReturnType<typeof mapUnifiedItemFromDb> | undefined = undefined;
    let actuallyRetained = false;
    const warnings: string[] = [];

    // 받아쓰기는 텍스트 초안일 뿐이므로 기본값에서는 DB/Storage에 자동 저장하지 않습니다.
    // '원본 보관'을 명시적으로 선택한 경우에만 voice 항목과 전사 이력을 생성합니다.
    if (retainOriginal) {
      const nowIso = new Date().toISOString();
      const parentItem = {
        id: itemId,
        source: "manual" as const,
        title: transcript.slice(0, 80),
        content: transcript,
        created_at: nowIso,
        author: { name: user.email || "사용자" },
        url: "",
        status: "pending" as const,
        itemType: "voice" as const,
        attributes: { captureMode: "voice", durationSeconds: durationSeconds || undefined },
        version: 1,
        privacyScope: "cloud_private" as const,
        aiPolicy: "cloud_allowed" as const,
        updatedAt: nowIso,
      };
      const { data: insertedItem, error: parentError } = await supabase
        .from("unified_items")
        .insert(mapUnifiedItemToDbRow(parentItem, user.id))
        .select("*")
        .single();
      if (parentError || !insertedItem) {
        return NextResponse.json({ error: "음성 메모 항목을 저장하지 못했습니다." }, { status: 500 });
      }
      savedItem = mapUnifiedItemFromDb(insertedItem);

      const storagePath = `${user.id}/${itemId}/${crypto.randomUUID()}${audioExtension(mimeType)}`;
      const { error: uploadError } = await supabase.storage
        .from("private-assets")
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (!uploadError) {
        const asset = buildContentAsset(
          {
            itemId,
            kind: "audio",
            provider: "supabase",
            providerRef: storagePath,
            mimeType,
            sizeBytes: file.size,
            retentionPolicy: "user_kept",
          },
          user.id
        );

        const assetRow = mapContentAssetToDbRow(asset, user.id);
        const { data: insertedAsset, error: assetInsertError } = await supabase
          .from("content_assets")
          .insert(assetRow)
          .select("id")
          .single();

        if (assetInsertError) {
          await supabase.storage.from("private-assets").remove([storagePath]);
          warnings.push("음성 원본은 보관되지 않았습니다.");
        } else if (insertedAsset) {
          createdAssetId = insertedAsset.id;
          actuallyRetained = true;
        }
      } else {
        warnings.push("음성 원본은 보관되지 않았습니다.");
      }

      const artifact = buildAiArtifact(
        {
          itemId,
          artifactType: "transcription",
          contentText: transcript,
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
        user.id
      );
      const { data: insertedArt, error: artifactError } = await supabase
        .from("ai_artifacts")
        .insert(mapAiArtifactToDbRow(artifact, user.id))
        .select("id")
        .single();
      if (artifactError || !insertedArt) {
        warnings.push("전사 결과의 AI 이력 저장에 실패했습니다.");
      } else {
        createdArtifactId = insertedArt.id;
      }
    }

    return NextResponse.json({
      transcript,
      item: savedItem,
      artifactId: createdArtifactId,
      assetId: createdAssetId,
      provider: "gemini",
      retained: actuallyRetained,
      warnings,
    });
  } catch {
    return NextResponse.json({ error: "음성 전사 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
