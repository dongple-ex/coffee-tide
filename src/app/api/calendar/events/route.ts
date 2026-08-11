import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      error: "Calendar 등록 경로가 Phase D 승인 API로 이전됐습니다. 화면을 새로고침해 주세요.",
    },
    { status: 410 }
  );
}
