import { NextRequest, NextResponse } from "next/server";
import { readSessionWithIntegrations } from "@/lib/auth/integrationStore";
import { getOrCreateMeetingFolder, uploadToDrive } from "@/lib/google/drive";

export async function POST(req: NextRequest) {
  try {
    const session = await readSessionWithIntegrations();
    if (!session || !session.googleToken) {
      return NextResponse.json({ error: "Unauthorized or missing Google token" }, { status: 401 });
    }

    const { context, transcript, result } = await req.json();
    if (!context || !result) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. 폴더 구조 생성
    const now = new Date();
    const meetingId = `Meeting_${now.getTime()}`;
    const year = now.getFullYear().toString();
    const folderId = await getOrCreateMeetingFolder(session.googleToken, meetingId, year);

    // 2. 결과 JSON 업로드
    const jsonFileName = `Analysis_${meetingId}.json`;
    await uploadToDrive(session.googleToken, { name: jsonFileName, mimeType: "application/json", parents: [folderId] }, JSON.stringify(result, null, 2));

    // 3. (선택적) 전사 텍스트(transcript)도 백업으로 txt 파일 저장
    if (transcript && transcript.length > 0) {
      const txtFileName = `Transcript_${meetingId}.txt`;
      await uploadToDrive(session.googleToken, { name: txtFileName, mimeType: "text/plain", parents: [folderId] }, transcript);
    }

    return NextResponse.json({ success: true, folderId });
  } catch (err: unknown) {
    console.error("Save meeting to drive failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save meeting" }, { status: 500 });
  }
}
