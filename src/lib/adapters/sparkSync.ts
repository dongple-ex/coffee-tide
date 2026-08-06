// Gemini Spark & 외부 Cloud Agent 수신 어댑터
import { UnifiedData, UnifiedCategory } from "../types/unified";

export interface SparkBriefingItem {
  id: string;
  title: string;
  summary: string;
  category: "urgent" | "approval_required" | "meeting" | "action_required" | "reference";
  sourceApp?: string; // 예: "Gmail", "Google Calendar", "Google Drive"
  actionUrl?: string;
  timestamp: string;
  status: "pending" | "completed" | "flagged";
}

// 메모리 인메모리 저장소 (서버 세션용)
let sparkCache: SparkBriefingItem[] = [
  {
    id: "spark-sample-1",
    title: "Google Calendar: 내일 오후 2시 팀 주간 회의 생성 완료",
    summary: "Gemini Spark가 캘린더에서 참석자 4명의 시간을 자동 조율하여 초대를 발송했습니다.",
    category: "meeting",
    sourceApp: "Google Calendar",
    timestamp: "방금 전",
    status: "completed",
  },
  {
    id: "spark-sample-2",
    title: "Gmail: [승인 필요] 8월 클라우드 비용 인보이스 도착",
    summary: "경리팀 인보이스 메일이 수신되었습니다. 최종 결재 후 드라이브에 보관을 대기 중입니다.",
    category: "approval_required",
    sourceApp: "Gmail",
    timestamp: "10분 전",
    status: "pending",
  },
];

export function getSparkBriefings(): SparkBriefingItem[] {
  return sparkCache;
}

export function addSparkBriefing(item: Omit<SparkBriefingItem, "id" | "timestamp">): SparkBriefingItem {
  const newItem: SparkBriefingItem = {
    ...item,
    id: `spark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  };
  sparkCache = [newItem, ...sparkCache].slice(0, 30); // 최근 30개 유지
  return newItem;
}

export function toUnifiedData(sparkItem: SparkBriefingItem): UnifiedData {
  return {
    id: sparkItem.id,
    source: "gmail", // UnifiedSource
    title: `[${sparkItem.sourceApp || "Gemini Spark"}] ${sparkItem.title}`,
    content: sparkItem.summary,
    created_at: sparkItem.timestamp,
    author: { name: sparkItem.sourceApp || "Gemini Spark" },
    url: sparkItem.actionUrl || "",
    status: sparkItem.status === "completed" ? "completed" : "pending",
    category: sparkItem.category as UnifiedCategory,
    actionDirective: sparkItem.summary,
  };
}

export function getSparkUnifiedItems(): UnifiedData[] {
  return sparkCache.map(toUnifiedData);
}
